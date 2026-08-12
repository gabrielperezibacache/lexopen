import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { isStaff } from "@/lib/auth/rbac";
import { persistentStorageReady, storageMode } from "@/lib/storage";
import { recoverPendingDocumentProcessing } from "@/lib/document-processing-queue";
import { getOcrCapability } from "@/lib/local-ocr";

function desktopDetails() {
  return {
    desktop: process.env.LEXOPEN_DESKTOP === "1",
    desktopMode: process.env.LEXOPEN_DESKTOP_MODE || null,
    publicUrl: process.env.NEXT_PUBLIC_APP_URL || null,
    version: process.env.LEXOPEN_APP_VERSION || null,
    previousVersion: process.env.LEXOPEN_PREVIOUS_APP_VERSION || null,
    updateRecognized: process.env.LEXOPEN_UPDATE_RECOGNIZED === "1",
  };
}

function noStoreJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

export async function GET() {
  const time = new Date().toISOString();
  const storage = storageMode();
  const storageReady = persistentStorageReady();
  const storageRequired = process.env.LEXOPEN_REQUIRE_PERSISTENT_STORAGE === "1";
  const user = await getCurrentUser().catch(() => null);
  const staff = Boolean(user && isStaff(user.role));
  const desktopRuntime = process.env.LEXOPEN_DESKTOP === "1";

  try {
    const userRows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (SELECT 1 FROM "User") AS "exists"
    `;
    const needsSetup = !Boolean(userRows[0]?.exists);

    // Public probe: minimal fields for load balancers / web-host / desktop bootstrap.
    const publicBody: Record<string, unknown> = {
      ok: true,
      db: "up",
      storage,
      storageReady,
      storageRequired,
      needsSetup,
      time,
    };

    // Detailed recon (OCR, desktop URL/version) only for staff or local desktop runtime.
    if (staff || desktopRuntime) {
      const ocr = await getOcrCapability();
      publicBody.ocr = ocr;
      if (staff) {
        Object.assign(publicBody, desktopDetails());
      } else {
        publicBody.desktop = true;
        publicBody.version = process.env.LEXOPEN_APP_VERSION || null;
      }
    }

    void recoverPendingDocumentProcessing().catch((error) => {
      console.error("document processing recovery failed", error);
    });

    if (!storageReady && storageRequired) {
      return noStoreJson(
        {
          ...publicBody,
          ok: false,
          error: "Almacenamiento persistente no configurado",
        },
        503
      );
    }

    if (!storageReady) {
      publicBody.warning = "Almacenamiento local no persistente";
    }

    return noStoreJson(publicBody);
  } catch {
    return noStoreJson(
      {
        ok: false,
        db: "down",
        storage,
        storageReady,
        storageRequired,
        needsSetup: null,
        time,
      },
      503
    );
  }
}
