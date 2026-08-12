/**
 * Remoción de datos demo / reinicio a base vacía para producción.
 * No toca el schema; deja la BD lista para /setup (primer admin).
 */

import type { PrismaClient } from "@prisma/client";

/** Emails creados por `prisma/seed.ts` (dataset de demostración). */
export const DEMO_USER_EMAILS = [
  "socio@estudio.cl",
  "abogado@estudio.cl",
  "asistente@estudio.cl",
  "cliente@andes.cl",
] as const;

/**
 * Orden de borrado (hijos → padres). Incluye modelos posteriores al seed original
 * (p. ej. PjudSyncJob).
 */
export const PURGE_DATA_MODELS = [
  "ledgerEntry",
  "payment",
  "invoiceLine",
  "invoice",
  "expense",
  "timeEntry",
  "feeArrangement",
  "workflowInstance",
  "workflow",
  "notification",
  "message",
  "comment",
  "qaPost",
  "qaThread",
  "iSheetRow",
  "iSheetColumn",
  "iSheet",
  "blogPost",
  "wikiPage",
  "task",
  "fileVersion",
  "siteFile",
  "folder",
  "siteGroup",
  "siteMember",
  "site",
  "groupMember",
  "group",
  "activity",
  "minutaAccion",
  "minuta",
  "nota",
  "plazo",
  "documento",
  "parte",
  "etapaHistorial",
  "causaMovimiento",
  "pjudSyncJob",
  "agentChat",
  "causa",
  "cliente",
  "jurisprudencia",
  "integrationConfig",
  "auditEvent",
  "firmSettings",
  "organization",
  "user",
] as const;

/** Catálogos de referencia Chile (opcionales de conservar). */
export const PURGE_CATALOG_MODELS = [
  "minutaPlantilla",
  "ufRate",
  "tribunal",
] as const;

export const PURGE_CONFIRM_PHRASE = "ELIMINAR DATOS DEMO";

export type PurgeDemoOptions = {
  /** Conservar tribunales, UF y plantillas de minuta (default true). */
  keepCatalogs?: boolean;
};

export type PurgeDemoResult = {
  deleted: Record<string, number>;
  keptCatalogs: boolean;
  needsSetup: boolean;
};

export async function detectDemoDataset(prisma: PrismaClient) {
  const demoUsers = await prisma.user.count({
    where: { email: { in: [...DEMO_USER_EMAILS] } },
  });
  const users = await prisma.user.count();
  const causas = await prisma.causa.count();
  const clientes = await prisma.cliente.count();
  return {
    looksLikeDemo: demoUsers > 0,
    demoUsers,
    users,
    causas,
    clientes,
    demoEmails: [...DEMO_USER_EMAILS],
  };
}

export async function purgeDemoData(
  prisma: PrismaClient,
  opts: PurgeDemoOptions = {}
): Promise<PurgeDemoResult> {
  const keepCatalogs = opts.keepCatalogs !== false;
  const deleted: Record<string, number> = {};

  const models = keepCatalogs
    ? [...PURGE_DATA_MODELS]
    : [...PURGE_DATA_MODELS, ...PURGE_CATALOG_MODELS];

  for (const model of models) {
    const delegate = (prisma as unknown as Record<string, { deleteMany: () => Promise<{ count: number }> }>)[
      model
    ];
    if (!delegate?.deleteMany) {
      throw new Error(`Modelo Prisma no disponible para purge: ${model}`);
    }
    const result = await delegate.deleteMany();
    deleted[model] = result.count;
  }

  const usersLeft = await prisma.user.count();
  return {
    deleted,
    keptCatalogs: keepCatalogs,
    needsSetup: usersLeft === 0,
  };
}
