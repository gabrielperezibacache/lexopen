import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import { canSome, type PermissionSubject } from "@/lib/auth/permissions";
import { isStaff } from "@/lib/auth/rbac";
import { safeJsonParse } from "@/lib/safe-json";

export type CodexSource = "personal" | "host";
export type PersonalCodexPreference = { enabled: boolean; model: string; source: CodexSource; revision: string };
export type HostCodexPolicy = { enabled: boolean; revision: string };
export type PersonalCodexAction = "connect" | "cancel" | "disconnect" | "models" | "save" | "test";
type ConfigClient = Pick<Prisma.TransactionClient, "integrationConfig">;
const legacyRevision = "legacy";
const providerFor = (actorId: string) => {
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(actorId)) throw httpError("Identidad de conexión no válida.", 400);
  return `codex:${actorId}`;
};
const revisionFor = (value: unknown) => typeof value === "string" && /^[\w-]{1,100}$/.test(value) ? value : legacyRevision;

export function canUsePersonalCodex(actor: PermissionSubject) {
  return isStaff(actor.role) && canSome(actor, "assistant.use");
}

/** Revoking AI use must not prevent someone from removing their own connection. */
export function assertPersonalCodexAction(actor: PermissionSubject, action: PersonalCodexAction, localOnly: boolean, enabled = false) {
  if (!isStaff(actor.role)) throw httpError("No tiene acceso a las conexiones internas.", 403);
  const usesCodex = action === "connect" || action === "models" || action === "test" || action === "save" && enabled;
  if (!usesCodex) return;
  if (!canUsePersonalCodex(actor)) throw httpError("No tiene permiso para usar IA. Puede desactivar o desconectar su cuenta personal.", 403);
  if (localOnly) throw httpError("El estudio permite sólo IA local. La conexión personal de Codex no puede usarse bajo esa política.", 403);
}

function preferenceFor(row: { enabled: boolean; configJson: string } | null): PersonalCodexPreference {
  const config = safeJsonParse<{ model?: unknown; source?: unknown; revision?: unknown } | null>(row?.configJson, {}) ?? {};
  return {
    enabled: row?.enabled ?? false,
    model: typeof config.model === "string" ? config.model.slice(0, 200) : "",
    source: config.source === "host" ? "host" : "personal",
    revision: revisionFor(config.revision),
  };
}

export async function personalCodexPreference(actorId: string): Promise<PersonalCodexPreference> {
  const provider = providerFor(actorId);
  const row = await prisma.integrationConfig.findUnique({ where: { provider } });
  return preferenceFor(row?.provider === provider ? row : null);
}

export async function savePersonalCodexPreference(actorId: string, input: { enabled: boolean; model: string; source?: CodexSource }) {
  const provider = providerFor(actorId);
  const value: PersonalCodexPreference = { enabled: input.enabled, model: input.model, source: input.source ?? "personal", revision: randomUUID() };
  const data = { enabled: value.enabled, configJson: JSON.stringify({ model: value.model, source: value.source, revision: value.revision }) };
  await prisma.integrationConfig.upsert({ where: { provider }, create: { provider, ...data }, update: data });
  return value;
}

/** Invalidate prepared requests without overwriting a concurrent source/model choice. */
export async function rotatePersonalCodexRevision(actorId: string) {
  const provider = providerFor(actorId);
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await prisma.integrationConfig.findUnique({ where: { provider } });
    if (!row) return;
    const config = safeJsonParse<Record<string, unknown>>(row.configJson, {});
    const changed = await prisma.integrationConfig.updateMany({ where: { provider, configJson: row.configJson }, data: { configJson: JSON.stringify({ ...config, revision: randomUUID() }) } });
    if (changed.count) return;
  }
  throw new Error("No se pudo actualizar la revisión de Codex; vuelva a intentarlo.");
}

export async function hostCodexPolicy(): Promise<HostCodexPolicy> {
  const row = await prisma.integrationConfig.findUnique({ where: { provider: "codex-host" } });
  if (!row || row.provider !== "codex-host") return { enabled: false, revision: legacyRevision };
  const config = safeJsonParse<{ revision?: unknown } | null>(row.configJson, {}) ?? {};
  return { enabled: row.enabled, revision: revisionFor(config.revision) };
}

export async function saveHostCodexPolicy(enabled: boolean, client: ConfigClient = prisma, expectedRevision?: string): Promise<HostCodexPolicy> {
  const value = { enabled, revision: randomUUID() };
  const data = { enabled, configJson: JSON.stringify({ revision: value.revision }) };
  if (expectedRevision !== undefined) {
    const row = await client.integrationConfig.findUnique({ where: { provider: "codex-host" } });
    const config = safeJsonParse<{ revision?: unknown } | null>(row?.configJson, {}) ?? {};
    if (!row || revisionFor(config.revision) !== expectedRevision) throw httpError("La conexión del Host cambió. Vuelva a comprobarla antes de compartirla.", 409);
    const changed = await client.integrationConfig.updateMany({ where: { provider: "codex-host", configJson: row.configJson }, data });
    if (!changed.count) throw httpError("La conexión del Host cambió. Vuelva a comprobarla antes de compartirla.", 409);
    return value;
  }
  await client.integrationConfig.upsert({ where: { provider: "codex-host" }, create: { provider: "codex-host", ...data }, update: data });
  return value;
}
