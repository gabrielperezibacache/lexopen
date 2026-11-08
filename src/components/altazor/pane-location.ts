export type Pane = "chat" | "memory" | "connectors" | "computer";

/** A deliberate tool change updates only its navigation state. Account return
 * parameters remain available while Applications is open, until the user leaves. */
export function locationForAltazorPane(current: string, pane: Pane): string | null {
  const url = new URL(current);
  if (url.pathname !== "/inicio") return null;
  if (pane === "chat") url.searchParams.delete("altazor");
  else url.searchParams.set("altazor", pane);
  if (pane !== "connectors") for (const key of ["connector", "oauthAttempt", "oauthProvider", "oauth"]) url.searchParams.delete(key);
  return url.pathname + url.search + url.hash;
}
