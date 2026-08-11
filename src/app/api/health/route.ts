import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { persistentStorageReady, storageMode } from "@/lib/storage";

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
  const time = new Date().toISOString();
  const storage = storageMode();
  const storageReady = persistentStorageReady();
  try {
    await prisma.$queryRaw`SELECT 1`;
    if (!storageReady) {
      return NextResponse.json(
        {
          ok: false,
          db: "up",
          storage,
          storageReady,
          time,
          error: "Almacenamiento persistente no configurado",
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
    return NextResponse.json(
      {
        ok: true,
        db: "up",
        storage,
        storageReady,
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
        storageReady,
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
