import { NextRequest, NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { prisma } from "@/lib/db";
import {
  encryptMailboxPassword,
  ensureMailboxAccount,
} from "@/lib/mail/ingest";
import { assertImapHostAllowed } from "@/lib/mail/imap";
import { z } from "zod";

const saveSchema = z.object({
  protocol: z.enum(["demo", "imap"]),
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
    return NextResponse.json({
      account: account
        ? {
            ...account,
            passwordEnc: undefined,
            hasPassword: Boolean(account.passwordEnc),
          }
        : null,
    });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const body = saveSchema.parse(await req.json());
    if (body.protocol === "imap") {
      if (!body.imapHost || !body.email) {
        return NextResponse.json(
          { error: "IMAP requiere host y email" },
          { status: 400 }
        );
      }
      assertImapHostAllowed(body.imapHost);
    }
    const account = await ensureMailboxAccount(user.id);
    const updated = await prisma.mailboxAccount.update({
      where: { id: account.id },
      data: {
        protocol: body.protocol,
        email: body.email || null,
        imapHost: body.protocol === "imap" ? body.imapHost || null : null,
        imapPort: body.imapPort ?? 993,
        imapTls: body.imapTls ?? true,
        ...(body.password
          ? { passwordEnc: encryptMailboxPassword(body.password) }
          : {}),
      },
    });
    return NextResponse.json({
      account: {
        ...updated,
        passwordEnc: undefined,
        hasPassword: Boolean(updated.passwordEnc),
      },
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
