import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, handleRouteError, parseBody, requireCapability } from "@/lib/api";
import { rateLimitAsync } from "@/lib/auth/rate-limit";
import { getWhatsAppConfig } from "@/lib/notify/whatsapp-config";
import { createWhatsAppLink } from "@/lib/notify/whatsapp-link";
import { revokeCanal } from "@/lib/notify/channels";
import { prisma } from "@/lib/db";
export async function POST(req: Request) {
  try {
    assertCsrf(req);
    const user = await requireCapability("notify.channels.self");
    await parseBody(req, z.object({ consent: z.literal(true) }));
    if (!(await rateLimitAsync(`wa-link:${user.id}`, 5, 15 * 60_000)).ok) return NextResponse.json({ error: "Espere unos minutos antes de volver a vincular" }, { status: 429 });
    const config = await getWhatsAppConfig();
    if (!config) return NextResponse.json({ error: "WhatsApp no está habilitado en este Host" }, { status: 400 });
    const { code, expiresAt } = await createWhatsAppLink(user.id);
    const text = `LEXOPEN ${code}`;
    return NextResponse.json({ text, expiresAt, deepLink: `https://wa.me/${config.businessNumber.slice(1)}?text=${encodeURIComponent(text)}` }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return handleRouteError(e); }
}
export async function DELETE(req: Request) {
  try {
    assertCsrf(req); const user = await requireCapability("notify.channels.self");
    await revokeCanal({ userId: user.id, canal: "whatsapp" });
    await prisma.canalUsuario.deleteMany({ where: { userId: user.id, canal: "whatsapp", estado: "pendiente" } });
    return NextResponse.json({ ok: true });
  } catch (e) { return handleRouteError(e); }
}
