import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { isStaff } from "@/lib/auth/rbac";
import { persistentStorageReady, storageMode } from "@/lib/storage";
import {
  getDocumentProcessingQueueStatus,
  recoverPendingDocumentProcessing,
} from "@/lib/document-processing-queue";
import { getOcrCapability } from "@/lib/local-ocr";
import { isLoopbackHttpRequest } from "@/lib/net/loopback-request";
import { redisRateLimitConfigured } from "@/lib/auth/redis-rate-limit";
import { getPjudQueueStatus } from "@/lib/pjud/queue";
import { getLlmConfig } from "@/lib/integrations/llm";
import { log, newRequestId, setRequestId } from "@/lib/log";

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

async function privilegedIntegrations() {
  const [docQueue, pjudQueue, llm] = await Promise.all([
    Promise.resolve(getDocumentProcessingQueueStatus()),
    getPjudQueueStatus().catch(() => null),
    getLlmConfig().catch(() => null),
  ]);

  let apiUrlHost: string | null = null;
  if (llm?.apiUrl) {
    try {
      apiUrlHost = new URL(llm.apiUrl).host;
    } catch {
      apiUrlHost = null;
    }
  }
  const llmStatus = llm
    ? {
        preset: llm.preset || null,
        demo: Boolean(llm.allowDemo),
        hasApiKey: Boolean(llm.apiKey),
        configured: Boolean(llm.apiKey) || Boolean(llm.allowDemo),
        apiUrlHost,
      }
    : {
        preset: null,
        demo: false,
        hasApiKey: false,
        configured: false,
        apiUrlHost: null,
      };

  const pjudDemo =
    process.env.PJUD_ALLOW_DEMO === "1" &&
    process.env.LEXOPEN_KEEP_PJUD_DEMO !== "1"
      ? "unsafe"
      : process.env.PJUD_ALLOW_DEMO === "1"
        ? "kept"
        : "off";

  return {
    queues: {
      documents: docQueue,
      pjud: pjudQueue,
    },
    llm: llmStatus,
    pjud: {
      demo: pjudDemo,
      scrape: process.env.PJUD_CLAVEUNICA_SCRAPE === "1",
      queue: pjudQueue,
    },
    rateLimit: {
      redis: redisRateLimitConfigured(),
      backend: redisRateLimitConfigured() ? "redis" : "file-or-memory",
    },
  };
}

export async function GET(req: NextRequest) {
  const incomingId = req.headers.get("x-request-id")?.trim();
  const requestId = incomingId || newRequestId();
  setRequestId(requestId);

  const time = new Date().toISOString();
  const storage = storageMode();
  const storageReady = persistentStorageReady();
  const storageRequired = process.env.LEXOPEN_REQUIRE_PERSISTENT_STORAGE === "1";
  const user = await getCurrentUser().catch(() => null);
  const staff = Boolean(user && isStaff(user.role));
  const desktopRuntime = process.env.LEXOPEN_DESKTOP === "1";
  const localProbe = isLoopbackHttpRequest(req);
  // Bootstrap / storage details stay off the public internet surface.
  const privileged = staff || localProbe;

  try {
    const userRows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (SELECT 1 FROM "User") AS "exists"
    `;
    const needsSetup = !Boolean(userRows[0]?.exists);

    // Public probe: minimal fields for load balancers.
    const publicBody: Record<string, unknown> = {
      ok: true,
      db: "up",
      time,
      requestId,
    };

    if (privileged) {
      publicBody.storage = storage;
      publicBody.storageReady = storageReady;
      publicBody.storageRequired = storageRequired;
      publicBody.needsSetup = needsSetup;
      Object.assign(publicBody, await privilegedIntegrations());
    }

    // Detailed recon (OCR, desktop URL/version) only for staff or local desktop.
    if (staff || (desktopRuntime && localProbe)) {
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
      log.error("document_processing_recovery_failed", {
        err: error instanceof Error ? error.message : String(error),
      });
    });

    if (!storageReady && storageRequired) {
      return noStoreJson(
        {
          ...publicBody,
          ok: false,
          ...(privileged
            ? { error: "Almacenamiento persistente no configurado" }
            : {}),
        },
        503
      );
    }

    if (privileged && !storageReady) {
      publicBody.warning = "Almacenamiento local no persistente";
    }

    return noStoreJson(publicBody);
  } catch (error) {
    log.error("health_check_failed", {
      err: error instanceof Error ? error.message : String(error),
    });
    const body: Record<string, unknown> = {
      ok: false,
      db: "down",
      time,
      requestId,
    };
    if (privileged) {
      body.storage = storage;
      body.storageReady = storageReady;
      body.storageRequired = storageRequired;
      body.needsSetup = null;
    }
    return noStoreJson(body, 503);
  }
}
