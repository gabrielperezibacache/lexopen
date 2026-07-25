import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { storageConfigured } from "@/lib/storage";
import { getCurrentUser } from "@/lib/auth/session";
import { isStaff } from "@/lib/auth/rbac";

export async function GET(req: Request) {
  const ready = new URL(req.url).searchParams.get("ready") === "1";
  if (!ready) {
    return NextResponse.json({ ok: true });
  }
  const user = await getCurrentUser();
  if (!user || !isStaff(user.role)) {
    return NextResponse.json({ ok: true });
  }
  const time = new Date().toISOString();
  const storage = storageConfigured() ? "s3" : "local";
  const warnings =
    storage === "local" && process.env.NODE_ENV === "production"
      ? ["Storage local en producción es efímero; configure S3 compatible."]
      : [];
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      db: "up",
      storage,
      warnings,
      time,
    });
  } catch {
    return NextResponse.json(
      { ok: false, db: "down", storage, warnings, time },
      { status: 503 }
    );
  }
}
