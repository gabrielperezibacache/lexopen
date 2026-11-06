import { Prisma, type PrismaClient } from "@prisma/client";
import { writeAuditStrict } from "@/lib/audit";
import { httpError } from "@/lib/auth/access";
import { canSome } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { isWorkCountry, type WorkCountry } from "./countries";

type Client = PrismaClient | Prisma.TransactionClient;
const settingsSelect = { organizationId: true, workCountry: true } as const;

async function firstSettings(client: Client) {
  return client.firmSettings.findFirst({ orderBy: { id: "asc" }, select: settingsSelect });
}

export async function getWorkCountry(client: Client = prisma): Promise<WorkCountry | null> {
  const country = (await firstSettings(client))?.workCountry;
  return isWorkCountry(country) ? country : null;
}

export async function updateWorkCountry(country: WorkCountry | null, user: { id: string }, client: PrismaClient = prisma) {
  if (country !== null && !isWorkCountry(country)) throw httpError("Selecciona un país válido.", 400);
  for (let attempt = 0; ; attempt++) {
    try {
      return await client.$transaction(async tx => {
        const actor = await tx.user.findUnique({
          where: { id: user.id },
          select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true },
        });
        if (!actor || actor.role !== "admin" || !canSome(actor, "host.admin")) {
          throw httpError("Sólo la administración puede cambiar el país de trabajo.", 403);
        }
        const existing = await firstSettings(tx);
        if ((existing?.workCountry ?? null) === country) return { country };

        let organizationId = existing?.organizationId;
        if (!organizationId) {
          const organization = await tx.organization.findFirst({ orderBy: { id: "asc" }, select: { id: true } })
            ?? await tx.organization.create({ data: {}, select: { id: true } });
          organizationId = organization.id;
        }
        await tx.firmSettings.upsert({
          where: { organizationId },
          create: { organizationId, workCountry: country },
          update: { workCountry: country },
        });
        await writeAuditStrict({
          actorId: actor.id,
          action: "settings.work-country",
          entityType: "FirmSettings",
          entityId: organizationId,
          before: { country: existing?.workCountry ?? null },
          after: { country },
        }, tx);
        return { country };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if ((error as { code?: string }).code !== "P2034" || attempt >= 2) throw error;
    }
  }
}
