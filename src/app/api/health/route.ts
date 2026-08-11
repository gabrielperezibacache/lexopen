import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { storageConfigured } from "@/lib/storage";
import { getCurrentUser } from "@/lib/auth/session";
import { isStaff } from "@/lib/auth/rbac";

export async function GET() {
  const desktop = process.env.LEXOPEN_DESKTOP === "1";
  const desktopMode = process.env.LEXOPEN_DESKTOP_MODE || null;
  const publicUrl = process.env.NEXT_PUBLIC_APP_URL || null;

  const user = await getCurrentUser();
  if (!user || !isStaff(user.role)) {
    return NextResponse.json({
      ok: true,
      desktop,
      desktopMode,
      publicUrl,
    });
  }
  const time = new Date().toISOString();
  const storage = storageConfigured() ? "s3" : "local";
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      db: "up",
      storage,
      time,
      desktop,
      desktopMode,
      publicUrl,
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        db: "down",
        storage,
        time,
        desktop,
        desktopMode,
        publicUrl,
      },
      { status: 503 }
    );
  }
}
