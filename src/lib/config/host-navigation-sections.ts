import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { writeAuditStrict } from "@/lib/audit";
import { httpError } from "@/lib/auth/access";
import { canSome } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { HOST_NAVIGATION_SECTIONS, resolveHostNavigationSections, type HostNavigationSection } from "@/lib/navigation/host-sections";

export const visibleSectionsSchema = z.array(z.enum(HOST_NAVIGATION_SECTIONS)).max(HOST_NAVIGATION_SECTIONS.length);

type Client = PrismaClient | Prisma.TransactionClient;

function firstSettings(client: Client) {
  return client.firmSettings.findFirst({
    orderBy: { id: "asc" },
    select: { organizationId: true, visibleSections: true },
  });
}

export async function getHostNavigationSections(client: Client = prisma): Promise<HostNavigationSection[]> {
  return resolveHostNavigationSections((await firstSettings(client))?.visibleSections);
}

async function persistSections(visibleSections: HostNavigationSection[], client: Prisma.TransactionClient, existingOrganizationId?: string) {
  const organizationId = existingOrganizationId ?? (await client.organization.findFirst({ orderBy: { id: "asc" }, select: { id: true } })
    ?? await client.organization.create({ data: {}, select: { id: true } })).id;
  await client.firmSettings.upsert({
    where: { organizationId },
    create: { organizationId, visibleSections },
    update: { visibleSections },
  });
  return organizationId;
}

/** Called in the same transaction that creates the first account. */
export async function initializeHostNavigationSections(sections: HostNavigationSection[], client: Prisma.TransactionClient) {
  const current = await firstSettings(client);
  await persistSections(resolveHostNavigationSections(visibleSectionsSchema.parse(sections)), client, current?.organizationId);
}

export async function updateHostNavigationSections(sections: HostNavigationSection[], user: { id: string }, client: PrismaClient = prisma) {
  const visibleSections = resolveHostNavigationSections(visibleSectionsSchema.parse(sections));
  for (let attempt = 0; ; attempt++) {
    try {
      return await client.$transaction(async tx => {
        const actor = await tx.user.findUnique({
          where: { id: user.id },
          select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true },
        });
        if (!actor || actor.role !== "admin" || !canSome(actor, "host.admin")) {
          throw httpError("Sólo la administración puede cambiar las secciones visibles.", 403);
        }
        const existing = await firstSettings(tx);
        const before = resolveHostNavigationSections(existing?.visibleSections);
        if (before.length === visibleSections.length && before.every((section, index) => section === visibleSections[index])) return { visibleSections };

        const organizationId = await persistSections(visibleSections, tx, existing?.organizationId);
        await writeAuditStrict({
          actorId: actor.id, action: "settings.visible-sections", entityType: "FirmSettings", entityId: organizationId,
          before: { visibleSections: before }, after: { visibleSections },
        }, tx);
        return { visibleSections };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if ((error as { code?: string }).code !== "P2034" || attempt >= 2) throw error;
    }
  }
}
