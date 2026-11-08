import { z } from "zod";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { prisma } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { isAdmin } from "@/lib/auth/rbac";
import { httpError } from "@/lib/auth/access";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { getHelpChannelConfig, getWhatsAppMetaConfig, helpConfigSchema, publicHelpConfig, saveHelpChannelConfig } from "@/lib/altazor/help/config";
import { answerHelpRequest, cancelHelpRequest, listHelpRequests, pollHelpReplies } from "@/lib/altazor/help/service";
import { createWhatsAppHelpLink, revokeWhatsAppHelpLink } from "@/lib/altazor/help/whatsapp";
import { rateLimitAsync } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
function failure(error: unknown) { const response = handleRouteError(error); for (const [key, value] of Object.entries(headers)) response.headers.set(key, value); return response; }
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("configure"), config: helpConfigSchema }).strict(),
  z.object({ action: z.literal("poll") }).strict(),
  z.object({ action: z.literal("answer"), requestId: z.string().min(1).max(200), response: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ action: z.literal("cancel"), requestId: z.string().min(1).max(200) }).strict(),
  z.object({ action: z.literal("link_whatsapp") }).strict(),
  z.object({ action: z.literal("unlink_whatsapp"), channelId: z.string().min(1).max(200) }).strict(),
]);

export async function GET() {
  try {
    const actor = await requireStaff();
    const [config, requests, channels, meta] = await Promise.all([getHelpChannelConfig(actor.id), listHelpRequests(actor), prisma.canalUsuario.findMany({ where: { userId: actor.id, canal: "whatsapp", estado: "activo", verificadoAt: { not: null } }, select: { id: true, etiqueta: true } }), getWhatsAppMetaConfig()]);
    return Response.json({ config: publicHelpConfig(config), requests, whatsappChannels: channels.map(row => ({ id: row.id, label: row.etiqueta || "WhatsApp verificado" })), whatsappAvailable: Boolean(meta), whatsappDisplayPhone: meta?.displayPhone || null, canConfigureProviders: isAdmin(actor), canUse: can(actor, "assistant.use") }, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    assertCsrf(request);
    const actor = await requireStaff();
    const limited = await rateLimitAsync(`altazor-help:${actor.id}`, 30, 60_000);
    if (!limited.ok) throw httpError("Espere un momento antes de volver a consultar la ayuda.", 429);
    const input = await parseKnowledgeBody(request, schema, 16 * 1024);
    if (input.action === "configure") return Response.json({ config: await saveHelpChannelConfig(actor, input.config) }, { headers });
    if (input.action === "answer") return Response.json(await answerHelpRequest(actor, input), { headers });
    if (input.action === "cancel") return Response.json({ request: await cancelHelpRequest(actor, input.requestId) }, { headers });
    if (input.action === "link_whatsapp") return Response.json(await createWhatsAppHelpLink(actor), { headers });
    if (input.action === "unlink_whatsapp") return Response.json(await revokeWhatsAppHelpLink(actor, input.channelId), { headers });
    return Response.json(await pollHelpReplies(actor), { headers });
  } catch (error) { return failure(error); }
}
