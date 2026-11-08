import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { writeAuditStrict } from "@/lib/audit";
import { httpError } from "@/lib/auth/access";
import { isAdmin } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { firmFormSelect } from "./firm-form-fields";

const text = z.string().max(2000).nullable().optional();
/** Only shared firm settings belong here. Personal preferences and credentials have their own routes. */
export const firmSettingsPatchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  rut: text,
  email: text,
  telefono: text,
  direccion: text,
  emisorRazonSocial: text,
  emisorRut: text,
  emisorGiro: text,
  emisorDireccion: text,
  defaultRetencionPct: z.number().min(0).max(1).optional(),
  ivaPct: z.number().min(0).max(1).optional(),
  hermesAllowDemo: z.boolean().optional(),
  assistantLlmMode: z.enum(["local_only", "remote_allowed"]).optional(),
  auditLlmPrompts: z.boolean().optional(),
}).strict().refine(value => Object.values(value).some(item => item !== undefined), "Indique al menos un ajuste para guardar.");

type Patch = z.infer<typeof firmSettingsPatchSchema>;

function patchData(input: Patch) {
  const organization: Prisma.OrganizationUpdateInput = {};
  const settings: Prisma.FirmSettingsCreateWithoutOrganizationInput = {};
  if (input.name !== undefined) organization.name = input.name;
  for (const key of ["rut", "email", "telefono", "direccion"] as const) {
    if (input[key] !== undefined) organization[key] = input[key]?.trim() || null;
  }
  for (const key of ["emisorRazonSocial", "emisorRut", "emisorGiro", "emisorDireccion"] as const) {
    if (input[key] !== undefined) settings[key] = input[key]?.trim() || null;
  }
  for (const key of ["defaultRetencionPct", "ivaPct", "hermesAllowDemo", "assistantLlmMode", "auditLlmPrompts"] as const) {
    if (input[key] !== undefined) Object.assign(settings, { [key]: input[key] });
  }
  return { organization, settings };
}

export async function updateFirmSettings(raw: unknown, user: { id: string }, client: PrismaClient = prisma) {
  const input = firmSettingsPatchSchema.parse(raw);
  const { organization, settings } = patchData(input);
  for (let attempt = 0; ; attempt++) {
    try {
      return await client.$transaction(async tx => {
        const actor = await tx.user.findUnique({
          where: { id: user.id },
          select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true },
        });
        if (!actor || !isAdmin(actor)) throw httpError("Sólo la administración del Host puede cambiar los ajustes del estudio.", 403);
        const before = await tx.organization.findFirst({ orderBy: { id: "asc" }, select: firmFormSelect });
        const current = before ?? await tx.organization.create({ data: {}, select: firmFormSelect });
        const updated = await tx.organization.update({
          where: { id: current.id },
          data: {
            ...organization,
            ...(Object.keys(settings).length ? { settings: { upsert: {
              create: settings,
              update: settings,
            } } } : {}),
          },
          select: firmFormSelect,
        });
        await writeAuditStrict({ actorId: actor.id, action: "settings.firm", entityType: "Organization", entityId: current.id, before, after: updated }, tx);
        return updated;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if ((error as { code?: string }).code !== "P2034" || attempt >= 2) throw error;
    }
  }
}
