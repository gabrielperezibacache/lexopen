import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertCsrf,
  handleRouteError,
  parseBody,
  requireRole,
} from "@/lib/api";
import { getProvider } from "@/lib/notify/providers/registry";
import { emitNotification } from "@/lib/notify/emit";
import { processOutboxBatch } from "@/lib/notify/worker";

const schema = z.object({
  canal: z.enum(["email", "telegram", "push"]),
});

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const admin = await requireRole("admin");
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

    await emitNotification({
      tipo: "sistema.canal_caido",
      userId: admin.id,
      title: `Prueba ${body.canal}`,
      body: `Mensaje de prueba LexOpen vía ${body.canal} (${new Date().toISOString()})`,
      href: "/cuenta/notificaciones",
      dedupeKey: `test:${body.canal}:${admin.id}:${Date.now()}`,
    });

    const outbox = await processOutboxBatch({ limit: 5 });
    return NextResponse.json({ ok: true, health, outbox });
  } catch (e) {
    return handleRouteError(e);
  }
}
