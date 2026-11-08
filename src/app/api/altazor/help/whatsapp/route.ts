import { timingSafeEqual, createHash } from "node:crypto";
import { getWhatsAppMetaConfig } from "@/lib/altazor/help/config";
import { processWhatsAppHelpWebhook } from "@/lib/altazor/help/whatsapp";
import { boundedProviderText } from "@/lib/notify/providers/ntfy";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams, config = await getWhatsAppMetaConfig();
  const supplied = params.get("hub.verify_token") || "", expected = config?.verifyToken || "";
  if (params.get("hub.mode") !== "subscribe" || !expected || !timingSafeEqual(createHash("sha256").update(supplied).digest(), createHash("sha256").update(expected).digest())) return new Response("Forbidden", { status: 403, headers });
  return new Response((params.get("hub.challenge") || "").slice(0, 500), { headers });
}
export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length")) > 128 * 1024) return new Response("Too large", { status: 413, headers });
    const raw = await boundedProviderText(new Response(request.body), 128 * 1024);
    await processWhatsAppHelpWebhook(raw, request.headers.get("x-hub-signature-256"));
    return Response.json({ ok: true }, { headers });
  } catch (error) {
    const status = (error as { status?: number }).status;
    return Response.json({ error: status === 401 ? "Firma no válida" : "No se pudo procesar el evento" }, { status: status === 401 ? 401 : status === 400 ? 400 : 500, headers });
  }
}
