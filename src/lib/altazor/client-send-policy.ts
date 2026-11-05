import type { AltazorDestination } from "./types";

/** Called only by an explicit Send/Generate action, never by loading a screen. */
export function prepareAssistantSubmission(
  destination: Pick<AltazorDestination, "key" | "remote" | "permitted"> | null,
  expectedKey?: string,
) {
  if (!destination?.permitted || !destination.key) {
    throw new Error("ALTAZOR necesita una conexión disponible. Revísala en Mi asistente.");
  }
  if (expectedKey && destination.key !== expectedKey) {
    throw new Error("La conexión de ALTAZOR cambió. Tu mensaje se conserva; vuelve a enviarlo para continuar.");
  }
  // The existing server still checks the exact destination and the study's policy.
  return { destinationKey: destination.key, allowRemote: destination.remote };
}
