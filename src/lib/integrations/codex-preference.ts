import { prisma } from "@/lib/db";
import { safeJsonParse } from "@/lib/safe-json";
import { httpError } from "@/lib/auth/access";
import { canSome, type PermissionSubject } from "@/lib/auth/permissions";
import { isStaff } from "@/lib/auth/rbac";

export type PersonalCodexPreference = { enabled: boolean; model: string };
export type PersonalCodexAction = "connect" | "cancel" | "disconnect" | "models" | "save" | "test";
const providerFor = (actorId: string) => {
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(actorId)) throw httpError("Identidad de conexión no válida.", 400);
  return `codex:${actorId}`;
};

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

export async function personalCodexPreference(actorId: string): Promise<PersonalCodexPreference> {
  const row = await prisma.integrationConfig.findUnique({ where: { provider: providerFor(actorId) } });
  if (!row || row.provider !== providerFor(actorId)) return { enabled: false, model: "" };
  const config = safeJsonParse<unknown>(row.configJson, {});
  const model = config && typeof config === "object" && "model" in config ? config.model : undefined;
  return { enabled: row.enabled, model: typeof model === "string" ? model.slice(0, 200) : "" };
}

export async function savePersonalCodexPreference(actorId: string, value: PersonalCodexPreference) {
  const data = { enabled: value.enabled, configJson: JSON.stringify({ model: value.model }) };
  await prisma.integrationConfig.upsert({ where: { provider: providerFor(actorId) }, create: { provider: providerFor(actorId), ...data }, update: data });
  return value;
}
