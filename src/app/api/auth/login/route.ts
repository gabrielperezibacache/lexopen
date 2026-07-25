import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  SESSION_COOKIE,
  buildSessionCookieValue,
} from "@/lib/auth/session";
import { hashPassword, looksHashed, verifyPassword } from "@/lib/auth/password";
import { canImpersonate } from "@/lib/auth/rbac";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json());
    const email = body.email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
    }

    const ok = await verifyPassword(body.password, user.password);
    if (!ok) {
      return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
    }

    // Upgrade plaintext → hash on successful login
    if (!looksHashed(user.password)) {
      await prisma.user.update({
        where: { id: user.id },
        data: { password: await hashPassword(body.password) },
      });
    }

    const session = buildSessionCookieValue(user.id);
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
    res.cookies.set(SESSION_COOKIE, session.value, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: session.maxAge,
    });
    return res;
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Email y contraseña requeridos" }, { status: 400 });
    }
    return NextResponse.json({ error: "Error de autenticación" }, { status: 500 });
  }
}
