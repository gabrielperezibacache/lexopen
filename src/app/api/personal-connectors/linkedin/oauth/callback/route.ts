import { NextRequest } from "next/server";
import { receiveLinkedInCallback } from "@/lib/personal-connectors/linkedin/account";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  let success = false;
  try {
    await receiveLinkedInCallback({ state: request.nextUrl.searchParams.get("state") || "", code: request.nextUrl.searchParams.get("code") || undefined, denied: request.nextUrl.searchParams.has("error") });
    success = true;
  } catch { /* Provider responses and authorization codes never enter the page or logs. */ }
  return new Response(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ALTAZOR AI · LinkedIn</title><body><main><h1>${success ? "Autorización recibida" : "La autorización no se completó"}</h1><p>${success ? "Vuelva a la ventana original de ALTAZOR AI y pulse Comprobar autorización. Esta ventana ya puede cerrarse." : "Vuelva a ALTAZOR AI e inicie una conexión nueva. Su cuenta no se ha conectado."}</p></main></body></html>`, { status: success ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'", "X-Content-Type-Options": "nosniff" } });
}
