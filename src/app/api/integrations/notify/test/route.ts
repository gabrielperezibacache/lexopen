import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertCsrf,
  handleRouteError,
  parseBody,
  requireCapability,
} from "@/lib/api";
import { getProvider } from "@/lib/notify/providers/registry";
import { emitNotification } from "@/lib/notify/emit";
import { prisma } from "@/lib/db";
import { processOutboxBatch } from "@/lib/notify/worker";

const schema = z.object({
  canal: z.enum(["email", "telegram", "push"]),
});

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const admin = await requireCapability("host.admin");
    const body = await parseBody(req, schema);
    const provider = await getProvider(
      body.canal === "email" ? "email" : body.canal === "push" ? "webpush" : body.canal
    );
    if (!provider) {
      return NextResponse.json(
        { error: `Proveedor para ${body.canal} no configurado` },
        { status: 400 }
      );
    }
    const health = await provider.health();
    if (!health.ok) {
      return NextResponse.json(
        { error: `Salud del proveedor: ${health.detail || "fail"}` },
        { status: 400 }
      );
    }

    const emitted = await emitNotification({
      tipo: "sistema.canal_caido",
      testChannel: body.canal,
      userId: admin.id,
      title: `Prueba ${body.canal}`,
      body: `Mensaje de prueba LexOpen vía ${body.canal} (${new Date().toISOString()})`,
      href: "/cuenta/notificaciones",
      dedupeKey: `test:${body.canal}:${admin.id}:${Date.now()}`,
    });

    const rows = emitted.notificationId ? await prisma.mensajeSaliente.findMany({ where: { notificationId: emitted.notificationId }, select: { id: true } }) : [];
    if (!rows.length) return NextResponse.json({ error: "No hay un destino activo para este canal. Vincúlelo en Cuenta → Notificaciones." }, { status: 400 });
    const outbox = await processOutboxBatch({ limit: 100, messageIds: rows.map(row => row.id) });
    return NextResponse.json({ ok: outbox.sent > 0, health, outbox }, { status: outbox.sent > 0 ? 200 : 502 });
  } catch (e) {
    return handleRouteError(e);
  }
}
