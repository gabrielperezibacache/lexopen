import { ConnectorError } from "@/lib/personal-connectors/core";
import { oauthFailureReason, readOAuthTokenResponse } from "./oauth-token-response";

export type OAuthProviderStage = "token" | "account";
export const OAUTH_PROVIDER_RESPONSE_TIMEOUT_MS = 15_000;
export const OAUTH_PROVIDER_RESPONSE_MAX_BYTES = 64 * 1024;
type Failure = "network" | "timeout" | "rate_limited" | "unavailable" | "http_rejected" | "response_invalid" | "rejected";
const classifiedTokenErrors = new Set(["oauth_client_credentials", "oauth_code_rejected", "oauth_callback_mismatch", "oauth_cancelled"]);

// Only locally authored codes and messages leave this module. Remote bodies,
// headers, URLs and exception text are never attached to an error or its cause.
function failure(stage: OAuthProviderStage, kind: Failure) {
  return new ConnectorError(`oauth_${stage}_${kind}`, "No se confirmó la respuesta del servicio de autorización.", 502);
}
function timedOut(error: unknown, signal: AbortSignal) {
  return signal.aborted || error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}
function discard(response: Response) {
  // Cleanup must not extend the authorization deadline while waiting for a
  // remote stream to acknowledge cancellation.
  try { void response.body?.cancel().catch(() => {}); } catch { /* No remote error text leaves. */ }
}
async function boundedObject(response: Response, stage: OAuthProviderStage, signal: AbortSignal) {
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    if (!response.body) throw new Error();
    reader = response.body.getReader();
  } catch { throw failure(stage, "response_invalid"); }
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try { chunk = await reader.read(); signal.throwIfAborted(); }
      catch (error) { throw failure(stage, timedOut(error, signal) ? "timeout" : "network"); }
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > OAUTH_PROVIDER_RESPONSE_MAX_BYTES) {
        try { void reader.cancel().catch(() => {}); } catch { /* No response data enters the error. */ }
        throw failure(stage, "response_invalid");
      }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  try {
    const body: unknown = JSON.parse(Buffer.concat(chunks, size).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch { throw failure(stage, "response_invalid"); }
}
function tokenError(body: Record<string, unknown>): never {
  try { readOAuthTokenResponse(body, []); }
  catch (error) {
    if (error instanceof ConnectorError && classifiedTokenErrors.has(error.code)) {
      // Recreate from the allowlisted code; never forward an exception's text.
      throw new ConnectorError(error.code, oauthFailureReason(error.code), 409);
    }
  }
  throw failure("token", "rejected");
}

/** The caller supplies a fixed official URL and a literal stage. A code is sent
 * once; this helper never retries, stores a grant, or broadens authorization. */
export async function requestOAuthProviderJson(stage: OAuthProviderStage, url: string, init: RequestInit, fetcher: typeof fetch = fetch): Promise<Record<string, unknown>> {
  const signal = AbortSignal.timeout(OAUTH_PROVIDER_RESPONSE_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetcher(url, { ...init, redirect: "error", cache: "no-store", signal });
    signal.throwIfAborted();
  } catch (error) { throw failure(stage, timedOut(error, signal) ? "timeout" : "network"); }
  if (response.status === 429 || response.status >= 500) {
    discard(response);
    throw failure(stage, response.status === 429 ? "rate_limited" : "unavailable");
  }
  if (!response.ok && stage === "account") {
    discard(response);
    throw failure(stage, "http_rejected");
  }
  const body = await boundedObject(response, stage, signal);
  if (stage === "token" && body.error !== undefined) tokenError(body);
  if (!response.ok) throw failure(stage, "http_rejected");
  return body;
}
