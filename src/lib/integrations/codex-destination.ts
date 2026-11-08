import { sha256 } from "@/lib/evidence/fragments";
import { hostCodexPolicy, type HostCodexPolicy, type PersonalCodexPreference } from "./codex-preference";

/** Bind approval to the user, selected account and its lifecycle, never to credentials. */
export function codexDestinationIdentity(actorId: string, preference: PersonalCodexPreference, policy?: HostCodexPolicy) {
  const host = preference.source === "host";
  return {
    endpoint: host ? "OpenAI · Codex del Host" : "OpenAI · Codex personal",
    hostRevision: host ? policy?.revision : undefined,
    endpointHash: sha256(JSON.stringify(["lexopen-codex-v2", actorId, preference.source, preference.revision, ...(host ? [policy?.revision ?? "legacy", policy?.enabled ?? false] : [])])),
    permitted: preference.enabled && Boolean(preference.model) && (!host || policy?.enabled === true),
  };
}

export async function codexDestinationFor(actorId: string, preference: PersonalCodexPreference) {
  return codexDestinationIdentity(actorId, preference, preference.source === "host" ? await hostCodexPolicy() : undefined);
}
