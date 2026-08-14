import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import { normalizarRut, validarRut } from "@/lib/chile";
import { decryptSecret, encryptSecret, maskRut, secretsKeySource } from "@/lib/pjud/secret";
import {
  scrapeMisCausasWithClaveUnica,
  claveUnicaAutomationAllowed,
  publicScrapeEnabled,
  publicScrapeReady,
  type MisCausasItem,
} from "@/lib/pjud/public-scrape";
import {
  fetchMisCausasFromSidecar,
  probeScraperSidecarHealth,
  scraperSidecarConfigured,
} from "@/lib/pjud/scraper-sidecar";
import { enqueueDueSyncJobs, processPendingSyncJobs } from "@/lib/pjud/queue";
import { captchaSolverConfigured } from "@/lib/pjud/captcha-solver";
import {
  isMisCausasSyncInFlight,
} from "@/lib/pjud/mis-causas-sync-state";

export {
  isMisCausasSyncInFlight,
  MIS_CAUSAS_SYNC_STUCK_MS,
} from "@/lib/pjud/mis-causas-sync-state";

/**
 * Credenciales ClaveÚnica del estudio — paridad CausaMonitor
 * `POST/DELETE /api/pjud-credentials` + `GET /api/pjud-credentials/status`
 * y `GET /api/cases/mis-causas`.
 *
 * Password solo en vault local AES-GCM (`FirmSettings.claveUnicaPasswordEnc`);
 * las APIs de status nunca devuelven plaintext.
 */

async function getOrCreateFirmSettings() {
  const orgs = await prisma.organization.findMany({
    include: { settings: true },
    orderBy: { createdAt: "asc" },
    take: 5,
  });
  if (orgs.length > 1) {
    const withCu = orgs.find(
      (o) => o.settings?.claveUnicaPasswordEnc || o.settings?.claveUnicaRut
    );
    if (withCu) {
      return {
        org: withCu,
        settings:
          withCu.settings ||
          (await prisma.firmSettings.create({
            data: { organizationId: withCu.id },
          })),
      };
    }
  }
  const org =
    orgs[0] ||
    (await prisma.organization.create({
      data: {},
      include: { settings: true },
    }));
  if (org.settings) return { org, settings: org.settings };
  const settings = await prisma.firmSettings.create({
    data: { organizationId: org.id },
  });
  return { org, settings };
}

export async function getClaveUnicaStatus() {
  const { settings } = await getOrCreateFirmSettings();
  const scrapeFlag = claveUnicaAutomationAllowed(settings.claveUnicaEnabled);
  const sidecar = scraperSidecarConfigured();
  const sidecarHealth = sidecar ? await probeScraperSidecarHealth() : null;
  const publicScrape = publicScrapeEnabled();
  const captcha = captchaSolverConfigured();
  const blockers: string[] = [];
  if (!settings.claveUnicaEnabled) {
    blockers.push(
      "La conexión está pausada. Pulse «Reanudar conexión» para volver a usarla."
    );
  }
  if (!settings.claveUnicaRut || !settings.claveUnicaPasswordEnc) {
    blockers.push(
      "Todavía no hay RUT ni contraseña guardados. Complételos abajo (solo un administrador puede hacerlo)."
    );
  }
  if (!scrapeFlag) {
    blockers.push(
      "En este servidor la consulta automática a ClaveÚnica está apagada. Pida a quien administra el Host que la active, o revise Configuración → PJUD."
    );
  }
  const canUseSidecar = Boolean(
    sidecarHealth?.reachable && sidecarHealth.scrapeReady !== false
  );
  const canUseInProcess = publicScrapeReady();
  const warnings: string[] = [];
  if (sidecar && !sidecarHealth?.reachable && canUseInProcess) {
    warnings.push(
      "El servicio auxiliar (PJUD_SCRAPER_URL) no responde. LexOpen usará la consulta directa. Arranque `npm run pjud:host` o quite PJUD_SCRAPER_URL del .env si no lo necesita."
    );
  }
  if (!canUseSidecar && !canUseInProcess) {
    if (sidecar && !sidecarHealth?.reachable) {
      blockers.push(
        "El servicio auxiliar de consulta judicial no está en marcha. Arránquelo con `npm run pjud:host`, o quite PJUD_SCRAPER_URL del .env si prefiere solo consulta directa; mientras tanto LexOpen no puede entrar a Mis Causas."
      );
    } else if (
      sidecar &&
      sidecarHealth?.reachable &&
      sidecarHealth.scrapeReady === false
    ) {
      blockers.push(
        "El servicio auxiliar está encendido pero aún no puede consultar el Poder Judicial (falta el resolutor de CAPTCHA). Revise Integraciones → PJUD."
      );
    }
    if (!publicScrape) {
      blockers.push(
        "Falta activar la consulta directa al Poder Judicial en el servidor. Revise Integraciones → PJUD o Configuración."
      );
    } else if (!captcha) {
      blockers.push(
        "Falta configurar el resolutor de CAPTCHA (necesario para entrar a la Oficina Judicial Virtual). Hágalo en Integraciones → PJUD."
      );
    } else if (!(sidecar && sidecarHealth?.reachable)) {
      blockers.push(
        "Falta el navegador automatizado (Chromium) en este Host. En el servidor ejecute la instalación de Chromium para PJUD y reinicie LexOpen."
      );
    }
  }

  let readinessLabel = "Listo para sincronizar";
  let readinessHint =
    "Puede traer sus causas desde la Oficina Judicial Virtual y actualizar el monitoreo.";
  if (blockers.length) {
    readinessLabel = "Aún no se puede sincronizar";
    readinessHint = blockers[0];
  } else if (warnings.length) {
    readinessHint = warnings[0];
  }

  const channelLabel = canUseSidecar
    ? "Servicio auxiliar del Host"
    : canUseInProcess
      ? "Consulta directa desde LexOpen"
      : "Sin canal de consulta";

  return {
    enabled: settings.claveUnicaEnabled,
    rutMasked: maskRut(settings.claveUnicaRut),
    hasPassword: Boolean(settings.claveUnicaPasswordEnc),
    encryption: "aes-256-gcm",
    secretsKey: secretsKeySource(),
    lastSyncAt: settings.claveUnicaLastSyncAt,
    lastSyncStatus: settings.claveUnicaLastSyncStatus,
    lastSyncNote: settings.claveUnicaLastSyncNote,
    scrapeFlag,
    sidecar,
    sidecarReachable: sidecarHealth?.reachable ?? false,
    publicScrape,
    captchaConfigured: captcha,
    readyToSync: blockers.length === 0,
    blockers,
    warnings,
    readinessLabel,
    readinessHint,
    channelLabel,
  };
}

/** RUT del titular ClaveÚnica; 400 si el dígito verificador no calza. */
export function parseClaveUnicaRut(raw: string): string {
  const normalized = normalizarRut(raw.trim());
  if (!validarRut(normalized)) {
    throw httpError(
      "RUT ClaveÚnica inválido. Revise el dígito verificador (el ejemplo 12.345.678-9 no es un RUT válido).",
      400
    );
  }
  return normalized;
}

export async function saveClaveUnicaCredentials(opts: {
  rut: string;
  password: string;
  enabled?: boolean;
}) {
  const { settings } = await getOrCreateFirmSettings();
  const storedRut = parseClaveUnicaRut(opts.rut);
  return prisma.firmSettings.update({
    where: { id: settings.id },
    data: {
      claveUnicaRut: storedRut,
      claveUnicaPasswordEnc: encryptSecret(opts.password),
      claveUnicaEnabled: opts.enabled ?? true,
      claveUnicaLastSyncNote: "Datos de acceso guardados de forma segura.",
    },
  });
}

export async function clearClaveUnicaCredentials() {
  const { settings } = await getOrCreateFirmSettings();
  return prisma.firmSettings.update({
    where: { id: settings.id },
    data: {
      claveUnicaRut: null,
      claveUnicaPasswordEnc: null,
      claveUnicaEnabled: false,
      claveUnicaLastSyncNote: "Se eliminaron los datos de ClaveÚnica de este estudio.",
      claveUnicaLastSyncStatus: "cleared",
    },
  });
}

export async function setClaveUnicaEnabled(enabled: boolean) {
  const { settings } = await getOrCreateFirmSettings();
  return prisma.firmSettings.update({
    where: { id: settings.id },
    data: { claveUnicaEnabled: enabled },
  });
}

async function resolveMisCausasList(): Promise<MisCausasItem[]> {
  const { settings } = await getOrCreateFirmSettings();
  if (!settings.claveUnicaEnabled) {
    throw httpError("ClaveÚnica deshabilitada en el estudio.", 409);
  }
  if (!settings.claveUnicaRut || !settings.claveUnicaPasswordEnc) {
    throw httpError("Configure RUT y contraseña ClaveÚnica primero.", 400);
  }
  const password = decryptSecret(settings.claveUnicaPasswordEnc, {
    strict: true,
  });
  if (!password) {
    throw httpError(
      "No se pudo descifrar la contraseña ClaveÚnica (re-guarde con PJUD_SECRETS_KEY/SESSION_SECRET).",
      400
    );
  }

  let sidecarError: Error | null = null;
  if (scraperSidecarConfigured()) {
    const health = await probeScraperSidecarHealth();
    if (!health.reachable) {
      sidecarError = new Error(health.error || "sidecar no responde");
    } else if (health.scrapeReady === false) {
      sidecarError = new Error(
        "sidecar arriba pero scrapeReady=false (CAPTCHA / PJUD_PUBLIC_SCRAPE en el worker)"
      );
    } else {
      try {
        const fromSidecar = await fetchMisCausasFromSidecar({
          rut: settings.claveUnicaRut,
          password,
        });
        if (fromSidecar) return fromSidecar;
      } catch (error) {
        sidecarError = error instanceof Error ? error : new Error(String(error));
      }
    }
  }

  if (!claveUnicaAutomationAllowed(settings.claveUnicaEnabled)) {
    throw httpError(
      sidecarError
        ? `Sidecar PJUD no responde (${sidecarError.message}) y ClaveÚnica está bloqueada (PJUD_CLAVEUNICA_SCRAPE=0).`
        : "Automatización ClaveÚnica deshabilitada (PJUD_CLAVEUNICA_SCRAPE=0).",
      409
    );
  }

  try {
    return await scrapeMisCausasWithClaveUnica({
      rut: settings.claveUnicaRut,
      password,
      optedIn: settings.claveUnicaEnabled,
    });
  } catch (error) {
    if (sidecarError) {
      throw httpError(humanizeClaveUnicaSyncError(error, sidecarError), 502);
    }
    throw error;
  }
}

function humanizeClaveUnicaSyncError(error: unknown, sidecarError: Error): string {
  const scrapeNote = error instanceof Error ? error.message : "scrape falló";
  const sidecarNote = sidecarError.message || "no responde";
  const formIssue =
    /Timeout|not visible|locator\.fill|rut_hidden|formulario visible|campo RUN|campo de contraseña|Página no encontrada|404|no se completó el login|no llegó a OJV/i.test(
      scrapeNote
    );
  const listIssue =
    /no se listaron|Mis Causas|materias probadas|menú «Mis Causas»/i.test(
      scrapeNote
    );
  const sidecarTip =
    /fetch failed|ECONNREFUSED|no responde/i.test(sidecarNote)
      ? "Arranque el auxiliar con `npm run pjud:host` o quite PJUD_SCRAPER_URL del .env del Host si no lo usa."
      : `Auxiliar: ${sidecarNote.slice(0, 80)}.`;

  if (listIssue) {
    return [
      scrapeNote.length > 280 ? `${scrapeNote.slice(0, 280)}…` : scrapeNote,
      sidecarTip,
    ].join(" ");
  }
  if (formIssue) {
    return [
      "No se pudo completar el login de ClaveÚnica (formulario no disponible o bloqueo del sitio).",
      "LexOpen intentó la consulta directa porque el servicio auxiliar no responde.",
      sidecarTip,
      scrapeNote.length > 140 ? `Detalle: ${scrapeNote.slice(0, 140)}…` : `Detalle: ${scrapeNote}`,
    ].join(" ");
  }
  const short =
    scrapeNote.length > 220 ? `${scrapeNote.slice(0, 220)}…` : scrapeNote;
  return `Consulta directa: ${short} ${sidecarTip}`;
}

async function findExistingCausa(item: MisCausasItem) {
  if (item.ruc) {
    const byRuc = await prisma.causa.findFirst({
      where: { ruc: item.ruc },
      select: { id: true },
    });
    if (byRuc) return byRuc;
  }
  // Prefer rit+tribunal. Do not fall back to rit-only when tribunal is known —
  // the same RIT can exist in another tribunal and would link the wrong causa.
  if (item.tribunal) {
    return prisma.causa.findFirst({
      where: { rit: item.rit, tribunal: item.tribunal },
      select: { id: true },
    });
  }
  return prisma.causa.findFirst({
    where: { rit: item.rit },
    select: { id: true },
  });
}

/**
 * Claim the firm-wide Mis Causas sync slot (sets status=running).
 * Returns alreadyRunning when another sync is still in flight.
 */
export async function claimMisCausasSync(opts?: {
  note?: string;
  now?: Date;
}): Promise<{ alreadyRunning: boolean; settingsId: string }> {
  const { settings } = await getOrCreateFirmSettings();
  const now = opts?.now ?? new Date();
  if (
    isMisCausasSyncInFlight({
      status: settings.claveUnicaLastSyncStatus,
      lastSyncAt: settings.claveUnicaLastSyncAt,
      now,
    })
  ) {
    return { alreadyRunning: true, settingsId: settings.id };
  }
  await prisma.firmSettings.update({
    where: { id: settings.id },
    data: {
      claveUnicaLastSyncAt: now,
      claveUnicaLastSyncStatus: "running",
      claveUnicaLastSyncNote:
        opts?.note ||
        "Sincronizando Mis Causas… (puede tardar varios minutos; no cierre esta página).",
    },
  });
  return { alreadyRunning: false, settingsId: settings.id };
}

export async function syncMisCausas(opts?: {
  actorId?: string | null;
  syncMovimientos?: boolean;
  /**
   * When true, also drain enqueued movimiento jobs in this call.
   * Default false: enqueue only — avoids Cloudflare 524 / proxy ~100s limits.
   * Movimientos se procesan vía cron de monitoreo (`processPendingSyncJobs`).
   */
  processJobsInline?: boolean;
  /** Skip claim when the HTTP layer already marked running. */
  alreadyClaimed?: boolean;
}) {
  const { settings } = await getOrCreateFirmSettings();
  if (!opts?.alreadyClaimed) {
    const claim = await claimMisCausasSync();
    if (claim.alreadyRunning) {
      throw httpError(
        "Ya hay una sincronización de Mis Causas en curso. Espere a que termine.",
        409
      );
    }
  }

  let items: MisCausasItem[];
  try {
    items = await resolveMisCausasList();
  } catch (error) {
    const note = error instanceof Error ? error.message : "Error Mis Causas";
    await prisma.firmSettings.update({
      where: { id: settings.id },
      data: {
        claveUnicaLastSyncAt: new Date(),
        claveUnicaLastSyncStatus: "failed",
        claveUnicaLastSyncNote: note,
      },
    });
    throw error;
  }

  const created: string[] = [];
  const linked: string[] = [];
  const causaIdsForSync: string[] = [];

  for (const item of items) {
    const existing = await findExistingCausa(item);
    let causaId = existing?.id;
    if (!causaId) {
      const createdCausa = await prisma.causa.create({
        data: {
          titulo: item.caratula || item.rit,
          rit: item.rit,
          ruc: item.ruc || null,
          tribunal: item.tribunal,
          materia: "Por clasificar",
          caratula: item.caratula || null,
          estado: item.estado?.toLowerCase().includes("termin")
            ? "terminada"
            : "activa",
          pjudMonitoreoActivo: true,
          pjudFromMisCausas: true,
          pjudSource: "claveunica",
          pjudLastSyncStatus: "never",
          pjudNextSyncAt: new Date(),
          pjudLastSyncNote: "Importada desde Mis Causas (ClaveÚnica).",
        },
      });
      causaId = createdCausa.id;
      created.push(causaId);
    } else {
      await prisma.causa.update({
        where: { id: causaId },
        data: {
          pjudFromMisCausas: true,
          pjudMonitoreoActivo: true,
          pjudSource: "claveunica",
          pjudNextSyncAt: new Date(),
          ...(item.tribunal ? { tribunal: item.tribunal } : {}),
          ...(item.ruc ? { ruc: item.ruc } : {}),
        },
      });
      linked.push(causaId);
    }
    causaIdsForSync.push(causaId);
  }

  let syncResults: Array<{
    causaId: string;
    status: string;
    note?: string;
    inserted?: number;
  }> = [];
  let enqueued = 0;

  if (opts?.syncMovimientos !== false && causaIdsForSync.length) {
    // Enqueue durable jobs instead of N serial scrapes (avoids proxy timeouts).
    const jobs = await enqueueDueSyncJobs({
      causaIds: causaIdsForSync,
      trigger: "cron",
      limit: Math.min(causaIdsForSync.length, 100),
    });
    enqueued = jobs.length;
    if (opts?.processJobsInline) {
      const processed = await processPendingSyncJobs({
        actorId: opts?.actorId,
        limit: Math.min(jobs.length || 20, 40),
        jobIds: jobs.map((j) => j.id),
      });
      syncResults = processed.map((r) => ({
        causaId: r.causaId,
        status: r.status,
        note: r.note,
        inserted: r.inserted,
      }));
    }
  }

  const syncFailed = syncResults.filter(
    (r) => r.status === "failed" || r.status === "error"
  ).length;
  const syncOk = syncResults.length - syncFailed;
  const insertedTotal = syncResults.reduce(
    (sum, r) => sum + (r.inserted || 0),
    0
  );
  let lastSyncStatus: string = "ok";
  if (syncResults.length > 0 && syncFailed === syncResults.length) {
    lastSyncStatus = "failed";
  } else if (syncFailed > 0) {
    lastSyncStatus = "partial";
  }
  const noteParts = [
    `Se encontraron ${items.length} causa${items.length === 1 ? "" : "s"}`,
    `${created.length} nueva${created.length === 1 ? "" : "s"}`,
    `${linked.length} ya estaba${linked.length === 1 ? "" : "n"} en LexOpen`,
  ];
  if (enqueued) {
    noteParts.push(
      `${enqueued} puesta${enqueued === 1 ? "" : "s"} en cola para actualizar movimientos`
    );
  }
  if (syncResults.length) {
    if (syncFailed === 0) {
      noteParts.push(
        `movimientos al día (+${insertedTotal} nuevo${insertedTotal === 1 ? "" : "s"})`
      );
    } else if (syncOk === 0) {
      noteParts.push(
        `no se pudieron actualizar los movimientos (${syncFailed} con error)`
      );
    } else {
      noteParts.push(
        `${syncOk} actualizadas bien, ${syncFailed} con error (+${insertedTotal} movimientos nuevos)`
      );
    }
  }

  await prisma.firmSettings.update({
    where: { id: settings.id },
    data: {
      claveUnicaLastSyncAt: new Date(),
      claveUnicaLastSyncStatus: lastSyncStatus,
      claveUnicaLastSyncNote: `${noteParts.join(". ")}.`,
    },
  });

  return {
    listed: items.length,
    created: created.length,
    linked: linked.length,
    enqueued,
    syncOk,
    syncFailed,
    inserted: insertedTotal,
    items,
    syncResults,
  };
}
