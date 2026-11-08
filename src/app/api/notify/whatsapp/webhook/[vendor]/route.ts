import { NextResponse } from "next/server";
import { getWhatsAppConfig } from "@/lib/notify/whatsapp-config";
import { equalSignature, receiveWhatsAppLink, verifyMetaSignature, verifyTwilioSignature } from "@/lib/notify/whatsapp-link";
type Context = { params: Promise<{ vendor: string }> };
export async function GET(req: Request, ctx: Context) {
  const { vendor } = await ctx.params, config = await getWhatsAppConfig(), url = new URL(req.url);
  if (vendor !== "meta" || config?.vendor !== "meta" || url.searchParams.get("hub.mode") !== "subscribe" || !equalSignature(url.searchParams.get("hub.verify_token") || "", config.verifyToken!)) return new Response(null, { status: 403 });
  return new Response(url.searchParams.get("hub.challenge") || "", { headers: { "Cache-Control": "no-store" } });
}
export async function POST(req: Request, ctx: Context) {
  const { vendor } = await ctx.params, config = await getWhatsAppConfig();
  if (!config || vendor !== config.vendor) return new Response(null, { status: 404 });
  // Bound raw body while streaming; do not trust Content-Length.
  const reader = req.body?.getReader(); let raw = "", size = 0;
  if (!reader) return new Response(null, { status: 400 });
  const decoder = new TextDecoder();
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 262144) { await reader.cancel(); return new Response(null, { status: 413 }); } raw += decoder.decode(value, { stream: true }); }
  raw += decoder.decode();
  if (vendor === "meta") {
    if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256") || "", config.appSecret!)) return new Response(null, { status: 403 });
    let payload;
    try { payload = JSON.parse(raw); } catch { return new Response(null, { status: 400 }); }
    if (payload?.object !== "whatsapp_business_account" || !Array.isArray(payload.entry)) return new Response(null, { status: 400 });
    for (const entry of payload.entry) for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const value = change?.value;
      if (value?.metadata?.phone_number_id !== config.phoneNumberId) continue;
      for (const msg of Array.isArray(value.messages) ? value.messages : []) if (msg?.type === "text" && typeof msg.from === "string" && typeof msg.text?.body === "string") await receiveWhatsAppLink(`+${msg.from}`, msg.text.body);
    }
    return NextResponse.json({ ok: true });
  }
  if (!req.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded") || new URL(req.url).search) return new Response(null, { status: 400 });
  const params = new URLSearchParams(raw);
  if (!verifyTwilioSignature(config.callbackUrl, params, req.headers.get("x-twilio-signature") || "", config.authToken!)) return new Response(null, { status: 403 });
  if (params.get("AccountSid") !== config.accountSid || params.get("To") !== `whatsapp:${config.businessNumber}`) return new Response(null, { status: 403 });
  await receiveWhatsAppLink((params.get("From") || "").replace(/^whatsapp:/, ""), params.get("Body") || "");
  return new Response("<Response/>", { headers: { "Content-Type": "text/xml", "Cache-Control": "no-store" } });
}
