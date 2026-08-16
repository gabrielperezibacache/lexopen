import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  assertCsrf,
  handleRouteError,
  parseBody,
  requireUser,
} from "@/lib/api";
import {
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCodes,
  sealTotpSecret,
  totpOtpauthUrl,
  unsealTotpSecret,
  verifyTotpCode,
} from "@/lib/auth/totp";
import {
  mintTotpPendingToken,
  TOTP_PENDING_COOKIE,
  verifyTotpPendingToken,
} from "@/lib/auth/totp-pending";
import {
  ROLE_COOKIE,
  SESSION_COOKIE,
  buildSessionCookieValue,
} from "@/lib/auth/session";
import { baseCookieOptions } from "@/lib/auth/cookie-options";
import { appendCsrfCookie } from "@/lib/auth/csrf-token";
import { writeAuditStrict } from "@/lib/audit";
import { canImpersonate } from "@/lib/auth/rbac";
import { consumeBackupCode } from "@/lib/auth/totp";
import { rateLimitAsync } from "@/lib/auth/rate-limit";

export async function GET() {
  try {
    const user = await requireUser();
    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: { totpEnabled: true },
    });
    return NextResponse.json({
      totpEnabled: Boolean(row?.totpEnabled),
    });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const body = await parseBody(
      req,
      z.discriminatedUnion("action", [
        z.object({ action: z.literal("setup") }),
        z.object({
          action: z.literal("confirm"),
          code: z.string().min(6).max(12),
        }),
        z.object({
          action: z.literal("disable"),
          code: z.string().min(6).max(64),
        }),
        z.object({
          action: z.literal("verify-login"),
          code: z.string().min(6).max(64),
        }),
      ])
    );

    if (body.action === "verify-login") {
      const pending = verifyTotpPendingToken(
        req.cookies.get(TOTP_PENDING_COOKIE)?.value
      );
      if (!pending) {
        return NextResponse.json(
          { error: "Sesión 2FA expirada. Inicie sesión de nuevo." },
          { status: 401 }
        );
      }
      const limited = await rateLimitAsync(
        `totp-login:${pending.userId}`,
        12,
        15 * 60 * 1000
      );
      if (!limited.ok) {
        return NextResponse.json(
          { error: "Demasiados intentos 2FA" },
          { status: 429 }
        );
      }
      const user = await prisma.user.findUnique({ where: { id: pending.userId } });
      if (!user?.totpEnabled || !user.totpSecretEnc) {
        return NextResponse.json({ error: "2FA no configurado" }, { status: 400 });
      }
      const secret = unsealTotpSecret(user.totpSecretEnc);
      if (!secret) {
        return NextResponse.json({ error: "Secreto 2FA inválido" }, { status: 500 });
      }
      let ok = verifyTotpCode(secret, body.code);
      let backupJson = user.totpBackupCodes;
      if (!ok) {
        const consumed = await consumeBackupCode(user.totpBackupCodes, body.code);
        ok = consumed.ok;
        backupJson = consumed.remainingJson;
        if (ok) {
          await prisma.user.update({
            where: { id: user.id },
            data: { totpBackupCodes: backupJson },
          });
        }
      }
      if (!ok) {
        return NextResponse.json({ error: "Código 2FA inválido" }, { status: 401 });
      }
      const session = buildSessionCookieValue(
        user.id,
        user.sessionVersion,
        user.role
      );
      const res = NextResponse.json({
        ok: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
        demoSwitcher: canImpersonate(),
      });
      const cookieBase = baseCookieOptions({ maxAge: session.maxAge });
      res.cookies.set(SESSION_COOKIE, session.value, cookieBase);
      res.cookies.set(ROLE_COOKIE, user.role, {
        ...cookieBase,
        httpOnly: false,
      });
      res.cookies.set(TOTP_PENDING_COOKIE, "", { ...cookieBase, maxAge: 0 });
      appendCsrfCookie(res);
      await writeAuditStrict({
        actorId: user.id,
        action: "auth.totp_login",
        entityType: "User",
        entityId: user.id,
      });
      return res;
    }

    const user = await requireUser();

    if (body.action === "setup") {
      const secret = generateTotpSecret();
      await prisma.user.update({
        where: { id: user.id },
        data: {
          totpSecretEnc: sealTotpSecret(secret),
          totpEnabled: false,
        },
      });
      return NextResponse.json({
        secret,
        otpauthUrl: totpOtpauthUrl({ secret, email: user.email }),
      });
    }

    if (body.action === "confirm") {
      const row = await prisma.user.findUnique({ where: { id: user.id } });
      const secret = unsealTotpSecret(row?.totpSecretEnc);
      if (!secret) {
        return NextResponse.json(
          { error: "Inicie la configuración 2FA primero" },
          { status: 400 }
        );
      }
      if (!verifyTotpCode(secret, body.code)) {
        return NextResponse.json({ error: "Código inválido" }, { status: 400 });
      }
      const backupCodes = generateBackupCodes(8);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          totpEnabled: true,
          totpBackupCodes: await hashBackupCodes(backupCodes),
        },
      });
      await writeAuditStrict({
        actorId: user.id,
        action: "auth.totp_enable",
        entityType: "User",
        entityId: user.id,
      });
      return NextResponse.json({
        ok: true,
        backupCodes,
        message:
          "2FA activado. Guarde los códigos de respaldo; no se mostrarán de nuevo.",
      });
    }

    // disable
    const row = await prisma.user.findUnique({ where: { id: user.id } });
    if (!row?.totpEnabled) {
      return NextResponse.json({ ok: true, totpEnabled: false });
    }
    const secret = unsealTotpSecret(row.totpSecretEnc);
    let ok = secret ? verifyTotpCode(secret, body.code) : false;
    if (!ok) {
      const consumed = await consumeBackupCode(row.totpBackupCodes, body.code);
      ok = consumed.ok;
    }
    if (!ok) {
      return NextResponse.json({ error: "Código inválido" }, { status: 400 });
    }
    await prisma.user.update({
      where: { id: user.id },
      data: {
        totpEnabled: false,
        totpSecretEnc: null,
        totpBackupCodes: null,
        sessionVersion: { increment: 1 },
      },
    });
    await writeAuditStrict({
      actorId: user.id,
      action: "auth.totp_disable",
      entityType: "User",
      entityId: user.id,
    });
    return NextResponse.json({ ok: true, totpEnabled: false });
  } catch (e) {
    return handleRouteError(e);
  }
}

/** Used by login route to mint pending cookie without circular imports. */
export { mintTotpPendingToken, TOTP_PENDING_COOKIE };
