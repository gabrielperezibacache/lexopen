import { NextRequest, NextResponse } from "next/server";
import { connectorActor } from "@/lib/personal-connectors/http";
import { receiveEasyOAuth, failEasyOAuthReturn, captureInstalledOAuthReturn } from "@/lib/altazor/connectors/easy-oauth";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const params = new URLSearchParams({ altazor: "connectors" });
  let actor: Awaited<ReturnType<typeof connectorActor>> | undefined;
  const state = request.nextUrl.searchParams.get("state") || "";
  function context(result: { attemptId: string; provider: string; causaId: string | null }) { params.set("oauthAttempt", result.attemptId); params.set("oauthProvider", result.provider); if (result.causaId) params.set("causaId", result.causaId); }
  try {
    const presentedOrigin = new URL(`${request.nextUrl.protocol}//${request.headers.get("host") || request.nextUrl.host}`).origin;
    const returned = { state, code: request.nextUrl.searchParams.get("code") || undefined, denied: request.nextUrl.searchParams.has("error") };
    if (await captureInstalledOAuthReturn(returned, presentedOrigin)) return new NextResponse(`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vuelve a LexOpen</title>
<style>html{color-scheme:dark;background:#0d0f23;color:#f3f3f8}body{margin:0;min-height:100svh;display:grid;place-items:center;font:1rem/1.7 system-ui,sans-serif}main{max-width:32rem;padding:2rem}img{width:72px;height:72px;object-fit:contain}h1{font:400 clamp(2rem,6vw,3rem)/1.2 Georgia,serif;margin:1rem 0}p{color:#b8bdcf}.brand{color:#adb5ff;font-size:.875rem}</style></head>
<body><main><img src="/icons/lexopen-reader-transparent-192.png" alt=""><div class="brand">LexOpen</div><h1>Vuelve a LexOpen</h1><p>La respuesta de Google ya llegó. LexOpen comprobará la conexión en la ventana donde comenzaste.</p><p>Puedes cerrar esta pestaña.</p></main></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'", "X-Content-Type-Options": "nosniff" } });
    actor = await connectorActor(request);
    context(await receiveEasyOAuth(actor, returned, presentedOrigin));
  } catch {
    params.set("oauth", "failed");
    try { if (actor) context(await failEasyOAuthReturn(actor, state)); } catch { /* No scope or identity is disclosed without its current ACL. */ }
  }
  // A relative redirect stays on the current application; no provider-controlled target.
  return new NextResponse(null, { status: 303, headers: { Location: `/inicio?${params}`, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } });
}
