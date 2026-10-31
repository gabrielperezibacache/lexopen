import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertCsrf,
  handleRouteError,
  parseBody,
  requireRole,
} from "@/lib/api";
import {
  notifyProvidersSnapshot,
  saveSmtpConfig,
  saveTelegramConfig,
  saveWebPushConfig,
} from "@/lib/notify/config";
import { generateVapidKeys } from "@/lib/notify/providers/webpush";
import { providersHealth } from "@/lib/notify/providers/registry";
import { outboxStats } from "@/lib/notify/worker";
import { writeAuditStrict } from "@/lib/audit";

export async function GET() {
  try {
    await requireRole("admin");
    const [snapshot, health, outbox] = await Promise.all([
      notifyProvidersSnapshot(),
      providersHealth(),
      outboxStats(),
    ]);
    return NextResponse.json({ snapshot, health, outbox });
  } catch (e) {
    return handleRouteError(e);
  }
}

const schema = z.object({
  provider: z.enum(["smtp", "telegram", "webpush"]),
  enabled: z.boolean(),
  smtp: z
    .object({
      host: z.string().optional(),
      port: z.number().int().optional(),
      secure: z.boolean().optional(),
      user: z.string().optional(),
      pass: z.string().optional(),
      from: z.string().optional(),
      preferOverGmail: z.boolean().optional(),
    })
    .optional(),
  telegram: z
    .object({
      botToken: z.string().optional(),
      botUsername: z.string().optional(),
    })
    .optional(),
  webpush: z
    .object({
      publicKey: z.string().optional(),
      privateKey: z.string().optional(),
      subject: z.string().optional(),
      generate: z.boolean().optional(),
    })
    .optional(),
});

export async function PUT(req: NextRequest) {
  try {
    assertCsrf(req);
    const admin = await requireRole("admin");
    const body = await parseBody(req, schema);

    if (body.provider === "smtp") {
      await saveSmtpConfig({
        enabled: body.enabled,
        config: body.smtp || {},
      });
    } else if (body.provider === "telegram") {
      await saveTelegramConfig({
        enabled: body.enabled,
        botToken: body.telegram?.botToken,
        botUsername: body.telegram?.botUsername,
      });
    } else if (body.provider === "webpush") {
      let publicKey = body.webpush?.publicKey;
      let privateKey = body.webpush?.privateKey;
      if (body.webpush?.generate) {
        const keys = generateVapidKeys();
        publicKey = keys.publicKey;
        privateKey = keys.privateKey;
      }
      await saveWebPushConfig({
        enabled: body.enabled,
        publicKey,
        privateKey,
        subject: body.webpush?.subject,
      });
    }

    await writeAuditStrict({
      actorId: admin.id,
      action: "notify.provider.save",
      entityType: "IntegrationConfig",
      entityId: body.provider,
      after: { enabled: body.enabled },
    });

    const snapshot = await notifyProvidersSnapshot();
    return NextResponse.json({ ok: true, snapshot });
  } catch (e) {
    return handleRouteError(e);
  }
}
