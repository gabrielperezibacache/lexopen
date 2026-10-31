import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertCsrf,
  handleRouteError,
  parseBody,
  requireUser,
} from "@/lib/api";
import { upsertPushSubscription, revokeCanal } from "@/lib/notify/channels";
import { getWebPushConfig } from "@/lib/notify/config";

const schema = z.object({
  endpoint: z.string().url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireUser();
    const wp = await getWebPushConfig();
    if (!wp.enabled) {
      return NextResponse.json(
        { error: "Web Push no está habilitado" },
        { status: 400 }
      );
    }
    const body = await parseBody(req, schema);
    const row = await upsertPushSubscription({
      userId: user.id,
      subscription: {
        endpoint: body.endpoint,
        expirationTime: body.expirationTime ?? null,
        keys: body.keys,
      },
    });
    return NextResponse.json({ ok: true, id: row.id });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireUser();
    await revokeCanal({ userId: user.id, canal: "push" });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleRouteError(e);
  }
}
