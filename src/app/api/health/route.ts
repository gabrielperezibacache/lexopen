import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { storageConfigured } from "@/lib/storage";
import { getCurrentUser } from "@/lib/auth/session";
import { isStaff } from "@/lib/auth/rbac";

function desktopPayload() {
  return {
    desktop: process.env.LEXOPEN_DESKTOP === "1",
    desktopMode: process.env.LEXOPEN_DESKTOP_MODE || null,
    publicUrl: process.env.NEXT_PUBLIC_APP_URL || null,
    version: process.env.LEXOPEN_APP_VERSION || null,
    previousVersion: process.env.LEXOPEN_PREVIOUS_APP_VERSION || null,
    updateRecognized: process.env.LEXOPEN_UPDATE_RECOGNIZED === "1",
  };
}

export async function GET() {
  const base = desktopPayload();

  const user = await getCurrentUser();
  if (!user || !isStaff(user.role)) {
    return NextResponse.json(
      { ok: true, ...base },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  }
  const time = new Date().toISOString();
  const storage = storageConfigured() ? "s3" : "local";
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      {
        ok: true,
        db: "up",
        storage,
        time,
        ...base,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        db: "down",
        storage,
        time,
        ...base,
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  }
}
