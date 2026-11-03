import { prisma } from "@/lib/db";
import { safeJsonParse } from "@/lib/safe-json";

export type PersonalCodexPreference = { enabled: boolean; model: string };
const providerFor = (actorId: string) => `codex:${actorId}`;

export async function personalCodexPreference(actorId: string): Promise<PersonalCodexPreference> {
  const row = await prisma.integrationConfig.findUnique({ where: { provider: providerFor(actorId) } });
  if (!row || row.provider !== providerFor(actorId)) return { enabled: false, model: "" };
  const config = safeJsonParse<{ model?: unknown }>(row.configJson, {});
  return { enabled: row.enabled, model: typeof config.model === "string" ? config.model.slice(0, 200) : "" };
}

export async function savePersonalCodexPreference(actorId: string, value: PersonalCodexPreference) {
  const data = { enabled: value.enabled, configJson: JSON.stringify({ model: value.model }) };
  await prisma.integrationConfig.upsert({ where: { provider: providerFor(actorId) }, create: { provider: providerFor(actorId), ...data }, update: data });
  return value;
}
