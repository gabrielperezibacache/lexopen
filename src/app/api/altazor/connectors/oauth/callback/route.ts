import { NextRequest, NextResponse } from "next/server";
import { connectorActor } from "@/lib/personal-connectors/http";
import { receiveEasyOAuth, failEasyOAuthReturn } from "@/lib/altazor/connectors/easy-oauth";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const params = new URLSearchParams({ altazor: "connectors" });
  let actor: Awaited<ReturnType<typeof connectorActor>> | undefined;
  const state = request.nextUrl.searchParams.get("state") || "";
  function context(result: { attemptId: string; provider: string; causaId: string | null }) { params.set("oauthAttempt", result.attemptId); params.set("oauthProvider", result.provider); if (result.causaId) params.set("causaId", result.causaId); }
  try {
    actor = await connectorActor(request);
    const presentedOrigin = new URL(`${request.nextUrl.protocol}//${request.headers.get("host") || request.nextUrl.host}`).origin;
    context(await receiveEasyOAuth(actor, { state, code: request.nextUrl.searchParams.get("code") || undefined, denied: request.nextUrl.searchParams.has("error") }, presentedOrigin));
  } catch {
    params.set("oauth", "failed");
    try { if (actor) context(await failEasyOAuthReturn(actor, state)); } catch { /* No scope or identity is disclosed without its current ACL. */ }
  }
  // A relative redirect stays on the current application; no provider-controlled target.
  return new NextResponse(null, { status: 303, headers: { Location: `/inicio?${params}`, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } });
}
