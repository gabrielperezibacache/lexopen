import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { persistentStorageReady, storageMode } from "@/lib/storage";
import { recoverPendingDocumentProcessing } from "@/lib/document-processing-queue";
import { getOcrCapability } from "@/lib/local-ocr";

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
  const storageRequired = process.env.LEXOPEN_REQUIRE_PERSISTENT_STORAGE === "1";
  try {
    const userRows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (SELECT 1 FROM "User") AS "exists"
    `;
    const needsSetup = !Boolean(userRows[0]?.exists);
    const ocr = await getOcrCapability();
    void recoverPendingDocumentProcessing().catch((error) => {
      console.error("document processing recovery failed", error);
    });
    if (!storageReady && storageRequired) {
      return NextResponse.json(
        {
          ok: false,
          db: "up",
          storage,
          storageReady,
          storageRequired,
          needsSetup,
          ocr,
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
        storageRequired,
        needsSetup,
        ocr,
        ...(storageReady
          ? {}
          : { warning: "Almacenamiento local no persistente" }),
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
        storageRequired,
        needsSetup: null,
        ocr: null,
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
