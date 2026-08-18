import { NextRequest, NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { prisma } from "@/lib/db";
import {
  disconnectMailboxAccount,
  encryptMailboxPassword,
  ensureMailboxAccount,
} from "@/lib/mail/ingest";
import { assertImapHostAllowed, probeImapConnection } from "@/lib/mail/imap";
import { publicMailboxAccount } from "@/lib/mail/types";
import { decryptSecret } from "@/lib/pjud/secret";
import { z } from "zod";

const saveSchema = z.object({
  action: z.enum(["save-imap", "disconnect"]).default("save-imap"),
  email: z.string().email().optional().or(z.literal("")),
  imapHost: z.string().max(200).optional(),
  imapPort: z.coerce.number().int().min(1).max(65535).optional(),
  imapTls: z.boolean().optional(),
  password: z.string().max(500).optional(),
});

export async function GET() {
  try {
    const user = await requireStaff();
    const account = await prisma.mailboxAccount.findUnique({
      where: { userId: user.id },
    });
    return NextResponse.json({ account: publicMailboxAccount(account) });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const body = saveSchema.parse(await req.json());
    if (body.action === "disconnect") {
      const updated = await disconnectMailboxAccount(user.id);
      return NextResponse.json({ account: publicMailboxAccount(updated) });
    }

    if (!body.imapHost || !body.email) {
      return NextResponse.json(
        { error: "IMAP requiere host y email" },
        { status: 400 }
      );
    }
    assertImapHostAllowed(body.imapHost);
    const existing = await ensureMailboxAccount(user.id);
    const password =
      body.password ||
      decryptSecret(existing.passwordEnc, { strict: true }) ||
      "";
    if (!password) {
      return NextResponse.json(
        { error: "Indique la contraseña o contraseña de aplicación" },
        { status: 400 }
      );
    }
    await probeImapConnection({
      host: body.imapHost,
      port: body.imapPort ?? 993,
      tls: body.imapTls ?? true,
      user: body.email,
      password,
    });
    const updated = await prisma.mailboxAccount.update({
      where: { id: existing.id },
      data: {
        protocol: "imap",
        status: "connected",
        email: body.email,
        imapHost: body.imapHost,
        imapPort: body.imapPort ?? 993,
        imapTls: body.imapTls ?? true,
        passwordEnc: encryptMailboxPassword(password),
        oauthAccessEnc: null,
        oauthRefreshEnc: null,
        oauthExpiresAt: null,
        lastError: null,
      },
    });
    return NextResponse.json({ account: publicMailboxAccount(updated) });
  } catch (e) {
    return handleRouteError(e);
  }
}
