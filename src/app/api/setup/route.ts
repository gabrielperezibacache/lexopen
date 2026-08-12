import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, httpError } from "@/lib/api";
import { hashPassword } from "@/lib/auth/password";
import { rateLimit } from "@/lib/auth/rate-limit";
import {
  BOOTSTRAP_TOKEN_ENV,
  isValidBootstrapToken,
} from "@/lib/auth/bootstrap";

const setupSchema = z.object({
  token: z.string().min(1).max(256),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(320),
  password: z.string().min(12).max(256),
});

export async function GET() {
  try {
    const userCount = await prisma.user.count();
    return NextResponse.json(
      { needsSetup: userCount === 0 },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const ip =
      process.env.LEXOPEN_TRUSTED_PROXY === "1"
        ? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          req.headers.get("x-real-ip") ||
          "direct"
        : "direct";
    const limited = rateLimit(`setup:${ip}`, 8, 15 * 60 * 1000);
    if (!limited.ok) {
      return NextResponse.json(
        { error: "Demasiados intentos de instalación" },
        { status: 429 }
      );
    }
    const body = setupSchema.parse(await req.json());
    const expectedToken = process.env[BOOTSTRAP_TOKEN_ENV];
    if (!isValidBootstrapToken(body.token, expectedToken)) {
      return NextResponse.json({ error: "Token de instalación inválido" }, { status: 403 });
    }

    const email = body.email.toLowerCase();
    const password = await hashPassword(body.password);
    const user = await prisma.$transaction(
      async (tx) => {
        const count = await tx.user.count();
        if (count > 0) {
          throw httpError("La instalación ya fue configurada", 409);
        }

        return tx.user.create({
          data: {
            name: body.name,
            email,
            role: "admin",
            title: "Administrador del estudio",
            password,
            avatarColor: "#c47a3a",
          },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    // The user-count guard is the source of truth; clearing the process copy
    // also prevents repeated attempts during the current Host lifetime.
    process.env[BOOTSTRAP_TOKEN_ENV] = "";
    return NextResponse.json({ ok: true, user }, { status: 201 });
  } catch (e) {
    return handleRouteError(e);
  }
}
