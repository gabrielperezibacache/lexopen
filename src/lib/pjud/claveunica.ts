import { assertPjudManagementEnabled, getCaseManagementMode } from "@/lib/causas/management-mode";
import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import { normalizarRut, validarRut } from "@/lib/chile";
import { decryptSecret, encryptSecret, maskRut, secretsKeySource } from "@/lib/pjud/secret";
import {
  scrapeMisCausasWithClaveUnica,
  scrapeCausaDetailWithClaveUnica,
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
import { enqueueDueSyncJobs, processPendingSyncJobs, PJUD_MANUAL_SESSION_TRIGGER } from "@/lib/pjud/queue";
import { captchaSolverConfigured } from "@/lib/pjud/captcha-solver";
import { misCausasClaimableWhere } from "@/lib/pjud/mis-causas-sync-state";
import { isPlaceholderTribunal } from "@/lib/pjud/ojv-dom";
import type { PjudCausaRef, PjudFetchResult, PjudCuadernosCoverage } from "@/lib/pjud/types";
import { normalizeCuadernosCoverage } from "@/lib/pjud/cuadernos-coverage";
import { duplicateCausaWhere } from "@/lib/pjud/causa-origin";
import type { PjudMovimientosFetcher } from "@/lib/pjud/sync";
import { causaAccessWhere, assertCausaCapability, type CausaAccessUser } from "@/lib/auth/causa-access";
import { manualMisCausasAllowed } from "@/lib/pjud/mis-causas-access";
import { can } from "@/lib/auth/permissions";

/** A live, process-owned session source; HTTP routes do not accept this option. */
export type MisCausasSessionSource = {
  listMisCausas: () => Promise<MisCausasItem[]>;
  fetchMovimientos: PjudMovimientosFetcher;
  /** Revalidate the current actor/session before each durable mutation. */
  assertActive?: () => Promise<void>;
  /** Process-local policy; never accepted from request JSON. */
  downloadDocuments?: boolean;
  syncIntervalMinutes?: number;
};

export {
  isMisCausasSyncInFlight,
  MIS_CAUSAS_SYNC_STUCK_MS,
  misCausasClaimableWhere,
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
  const modeEnabled = await getCaseManagementMode() === "pjud_cl";
  const scrapeFlag = modeEnabled && claveUnicaAutomationAllowed(settings.claveUnicaEnabled);
  const sidecar = scraperSidecarConfigured();
  const sidecarHealth = sidecar && modeEnabled ? await probeScraperSidecarHealth() : null;
  const publicScrape = publicScrapeEnabled();
  const captcha = captchaSolverConfigured();
  const blockers: string[] = modeEnabled ? [] : ["El seguimiento judicial está pausado en la modalidad de gestión manual."];
  const hostNotices: string[] = [];
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
    hostNotices.push(
      "En este servidor la consulta automática a ClaveÚnica está apagada. Pida a quien administra el Host que la active, o revise Configuración → PJUD."
    );
  }
  const canUseSidecar = Boolean(
    sidecarHealth?.reachable && sidecarHealth.scrapeReady !== false
  );
  const canUseInProcess = publicScrapeReady();
  if (sidecar && !sidecarHealth?.reachable && canUseInProcess) {
    hostNotices.push(
      "El servicio auxiliar (PJUD_SCRAPER_URL) no responde. LexOpen usará la consulta directa. Arranque `npm run pjud:host` o quite PJUD_SCRAPER_URL del .env si no lo necesita."
    );
  }
  if (!canUseSidecar && !canUseInProcess) {
    if (sidecar && !sidecarHealth?.reachable) {
      hostNotices.push(
        "El servicio auxiliar de consulta judicial no está en marcha. Arránquelo con `npm run pjud:host`, o quite PJUD_SCRAPER_URL del .env si prefiere solo consulta directa; mientras tanto LexOpen no puede entrar a Mis Causas."
      );
    } else if (
      sidecar &&
      sidecarHealth?.reachable &&
      sidecarHealth.scrapeReady === false
    ) {
      hostNotices.push(
        "El servicio auxiliar está encendido pero aún no puede consultar el Poder Judicial (falta el resolutor de CAPTCHA). Revise Integraciones → PJUD."
      );
    }
    if (!publicScrape) {
      hostNotices.push(
        "Falta activar la consulta directa al Poder Judicial en el servidor. Revise Integraciones → PJUD o Configuración."
      );
    } else if (!captcha) {
      hostNotices.push(
        "Falta configurar el resolutor de CAPTCHA (necesario para entrar a la Oficina Judicial Virtual). Hágalo en Integraciones → PJUD."
      );
    } else if (!(sidecar && sidecarHealth?.reachable)) {
      hostNotices.push(
        "Falta el navegador automatizado (Chromium) en este Host. En el servidor ejecute la instalación de Chromium para PJUD y reinicie LexOpen."
      );
    }
  }

  const hostBlocked =
    !scrapeFlag || (!canUseSidecar && !canUseInProcess);
  let readinessLabel = "Listo para sincronizar";
  let readinessHint =
    "Puede traer sus causas desde la Oficina Judicial Virtual y actualizar el monitoreo.";
  if (blockers.length) {
    readinessLabel = "Aún no se puede sincronizar";
    readinessHint = blockers[0];
  } else if (hostBlocked) {
    readinessLabel = "Aún no se puede sincronizar";
    readinessHint =
      "El canal de consulta PJUD no está listo. El detalle está en Configuración → PJUD.";
  }

  const channelLabel = canUseSidecar
    ? "Servicio auxiliar del Host"
    : canUseInProcess
      ? "Consulta directa desde LexOpen"
      : "Sin canal de consulta";

  return {
    enabled: settings.claveUnicaEnabled && modeEnabled,
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
    readyToSync: blockers.length === 0 && !hostBlocked,
    blockers,
    hostNotices,
    warnings: [],
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

/** Dismiss sticky Mis Causas sync notes/errors without removing credentials. */
export async function clearClaveUnicaSyncMessages() {
  const { settings } = await getOrCreateFirmSettings();
  if (settings.claveUnicaLastSyncStatus === "running") {
    throw httpError(
      "Hay una sincronización en curso; espere a que termine antes de limpiar avisos.",
      409
    );
  }
  const failed =
    settings.claveUnicaLastSyncStatus === "failed" ||
    settings.claveUnicaLastSyncStatus === "partial";
  await prisma.firmSettings.updateMany({
    // No limpiar la nota de un claim iniciado después de esta lectura.
    // Si ya cambió, la respuesta inferior devuelve el estado fresco.
    where: {
      id: settings.id,
      claveUnicaLastSyncStatus: settings.claveUnicaLastSyncStatus,
      claveUnicaLastSyncAt: settings.claveUnicaLastSyncAt,
    },
    data: {
      claveUnicaLastSyncNote: null,
      ...(failed ? { claveUnicaLastSyncStatus: null } : {}),
    },
  });
  return getClaveUnicaStatus();
}

async function resolveMisCausasList(): Promise<MisCausasItem[]> {
  if (!claveUnicaAutomationAllowed(true)) {
    throw httpError(
      "Automatización ClaveÚnica deshabilitada (PJUD_CLAVEUNICA_SCRAPE=0).",
      409
    );
  }
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
    await assertPjudManagementEnabled();
    const health = await probeScraperSidecarHealth();
    if (!health.reachable) {
      sidecarError = new Error(health.error || "sidecar no responde");
    } else if (health.scrapeReady === false) {
      sidecarError = new Error(
        "sidecar arriba pero scrapeReady=false (CAPTCHA / PJUD_PUBLIC_SCRAPE en el worker)"
      );
    } else {
      await assertPjudManagementEnabled();
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

  await assertPjudManagementEnabled();
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

/**
 * Detalle de una causa vía Mis Causas (ClaveÚnica) cuando hay vault configurado.
 * Devuelve null si no hay credenciales / automatización; lanza si el scrape falla.
 */
export async function tryScrapeCausaDetailAuthenticated(
  causa: PjudCausaRef
): Promise<PjudFetchResult | null> {
  if (await getCaseManagementMode() !== "pjud_cl") return null;
  const { settings } = await getOrCreateFirmSettings();
  if (!settings.claveUnicaEnabled) return null;
  if (!settings.claveUnicaRut || !settings.claveUnicaPasswordEnc) return null;
  if (!claveUnicaAutomationAllowed(settings.claveUnicaEnabled)) return null;
  if (!publicScrapeReady()) return null;

  const password = decryptSecret(settings.claveUnicaPasswordEnc, {
    strict: true,
  });
  if (!password) return null;

  await assertPjudManagementEnabled();
  const scraped = await scrapeCausaDetailWithClaveUnica({
    rut: settings.claveUnicaRut,
    password,
    causa,
    optedIn: settings.claveUnicaEnabled,
  });
  return {
    provider: "scrape",
    movimientos: scraped.movimientos,
    note: scraped.note,
    demo: false,
    sala: scraped.sala,
    cuadernos: normalizeCuadernosCoverage(scraped.cuadernos),
  };
}

async function findExistingCausa(item: MisCausasItem, actor?: CausaAccessUser | null) {
  // RIT y RUC pueden repetirse entre tribunales. Sin uno identificado no es
  // seguro vincular la entrada a una causa de la cartera.
  if (isPlaceholderTribunal(item.tribunal)) return null;
  const where = duplicateCausaWhere(item);
  if (!where) return null;
  const now = new Date();
  return prisma.causa.findFirst({
    where: actor ? { AND: [where, causaAccessWhere(actor), ...(can(actor, "causa.write") ? [] : [{ OR: [{ abogadoId: actor.id }, { miembros: { some: { userId: actor.id, rol: { not: "lectura" }, desde: { lte: now }, OR: [{ hasta: null }, { hasta: { gt: now } }] } } }] }])] } : where,
    select: { id: true, pjudOrigin: true, pjudMonitoreoActivo: true },
  });
}

/**
 * Claim the firm-wide Mis Causas sync slot (sets status=running).
 * Returns alreadyRunning when another sync is still in flight.
 */
export async function claimMisCausasSync(opts?: {
  note?: string;
  now?: Date;
}): Promise<{ alreadyRunning: boolean; settingsId: string; claimedAt: Date | null }> {
  await assertPjudManagementEnabled();
  const { settings } = await getOrCreateFirmSettings();
  const now = opts?.now ?? new Date();
  // Compare-and-swap: solo un caller gana el slot (evita TOCTOU).
  const claimed = await prisma.firmSettings.updateMany({
    where: misCausasClaimableWhere({ settingsId: settings.id, now }),
    data: {
      claveUnicaLastSyncAt: now,
      claveUnicaLastSyncStatus: "running",
      claveUnicaLastSyncNote:
        opts?.note ||
        "Sincronizando Mis Causas… (puede tardar varios minutos; no cierre esta página).",
    },
  });
  if (claimed.count === 0) {
    return { alreadyRunning: true, settingsId: settings.id, claimedAt: null };
  }
  return { alreadyRunning: false, settingsId: settings.id, claimedAt: now };
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
  /** Claim adquirido por el Route Handler antes de responder 202. */
  claim?: { settingsId: string; claimedAt: Date };
  /** Internal ephemeral session; no password, cookies, HTML or rows from a request. */
  sessionSource?: MisCausasSessionSource;
}) {
  if (opts?.sessionSource !== undefined) {
    if (!opts.sessionSource || typeof opts.sessionSource.listMisCausas !== "function" ||
        typeof opts.sessionSource.fetchMovimientos !== "function") {
      throw httpError("La fuente de sesión debe ser interna y ejecutable.", 400);
    }
    if ((opts.sessionSource.assertActive !== undefined && typeof opts.sessionSource.assertActive !== "function") ||
        (opts.sessionSource.downloadDocuments !== undefined && typeof opts.sessionSource.downloadDocuments !== "boolean")) {
      throw httpError("La política de la sesión debe ser interna y válida.", 400);
    }
    if (opts.syncMovimientos !== false && opts.processJobsInline !== true) {
      throw httpError("Los movimientos de una sesión temporal deben procesarse mientras la sesión está abierta.", 400);
    }
  }
  await assertPjudManagementEnabled();
  await opts?.sessionSource?.assertActive?.();
  const actor = opts?.actorId ? await prisma.user.findUnique({ where: { id: opts.actorId }, select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true } }) : null;
  if (opts?.actorId && (!actor || (opts.sessionSource && !manualMisCausasAllowed(actor)))) throw httpError("No tiene permiso para importar causas.", 403);
  const { settings } = await getOrCreateFirmSettings();
  let claimedAt = opts?.claim?.claimedAt ?? null;
  if (opts?.claim && (
    opts.claim.settingsId !== settings.id ||
    settings.claveUnicaLastSyncStatus !== "running" ||
    settings.claveUnicaLastSyncAt?.getTime() !== claimedAt?.getTime()
  )) {
    throw httpError(
      "La sincronización fue reemplazada. Revise su estado antes de reintentar.",
      409
    );
  }
  if (!opts?.claim) {
    const claim = await claimMisCausasSync();
    if (claim.alreadyRunning) {
      throw httpError(
        "Ya hay una sincronización de Mis Causas en curso. Espere a que termine.",
        409
      );
    }
    claimedAt = claim.claimedAt;
  }
  if (!claimedAt) {
    throw httpError("No se pudo iniciar la sincronización. Vuelva a intentarlo.", 409);
  }
  const claimWhere = {
    id: settings.id,
    claveUnicaLastSyncStatus: "running",
    claveUnicaLastSyncAt: claimedAt,
  };
  const created: string[] = [];
  const linked: string[] = [];
  const enqueuedJobIds: string[] = [];
  let phase: "scrape" | "import" | "queue" = "scrape";
  try {
    if (opts?.sessionSource && (!claveUnicaAutomationAllowed(true) || !publicScrapeEnabled())) {
      throw httpError("La consulta de la sesión OJV está deshabilitada en este servidor.", 409);
    }
    const items = opts?.sessionSource
      ? await opts.sessionSource.listMisCausas()
      : await resolveMisCausasList();
    await assertPjudManagementEnabled();
    phase = "import";
    const causaIdsForSync: string[] = [];
    const itemsWithIds: Array<MisCausasItem & { causaId: string }> = [];

    for (const item of items) {
      await assertPjudManagementEnabled();
  await opts?.sessionSource?.assertActive?.();
      const existing = await findExistingCausa(item, actor);
      await assertPjudManagementEnabled();
  await opts?.sessionSource?.assertActive?.();
      let causaId = existing?.id;
      if (!causaId) {
        const createdCausa = await prisma.causa.create({
          data: {
            titulo: item.caratula || item.rit,
            rit: item.rit,
            ruc: item.ruc || null,
            tribunal: isPlaceholderTribunal(item.tribunal)
              ? "Por identificar"
              : item.tribunal,
            materia: "Por clasificar",
            caratula: item.caratula || null,
            ...(opts?.sessionSource && opts.actorId ? { abogadoId: opts.actorId, acceso: "equipo" } : {}),
            estado: item.estado?.toLowerCase().includes("termin")
              ? "terminada"
              : "activa",
            pjudMonitoreoActivo: true,
            pjudDocumentDownloadsEnabled: opts?.sessionSource?.downloadDocuments === true && Boolean(opts.actorId),
            ...(opts?.sessionSource?.downloadDocuments === true && opts.actorId ? { pjudDocumentDownloadOwnerId: opts.actorId } : {}),
            ...(opts?.sessionSource?.syncIntervalMinutes ? { pjudSyncIntervalMinutes: opts.sessionSource.syncIntervalMinutes } : {}),
            pjudFromMisCausas: true,
            pjudOrigin: "claveunica",
            pjudSource: "claveunica",
            pjudLastSyncStatus: "never",
            pjudNextSyncAt: new Date(),
            pjudLastSyncNote: "Importada desde Mis Causas (ClaveÚnica).",
          },
        });
        causaId = createdCausa.id;
        created.push(causaId);
      } else {
        if (actor) await assertCausaCapability(causaId, actor, "causa.write");
        await prisma.causa.update({
          where: { id: causaId },
          data: {
            pjudFromMisCausas: true,
            ...(opts?.sessionSource?.downloadDocuments === true && opts.actorId ? { pjudDocumentDownloadsEnabled: true, pjudDocumentDownloadOwnerId: opts.actorId } : {}),
            ...(opts?.sessionSource?.syncIntervalMinutes ? { pjudSyncIntervalMinutes: opts.sessionSource.syncIntervalMinutes } : {}),
            ...(existing?.pjudOrigin ? {} : { pjudOrigin: "claveunica" }),
            pjudSource: "claveunica",
            ...(existing?.pjudMonitoreoActivo ? { pjudNextSyncAt: new Date() } : {}),
            ...(!isPlaceholderTribunal(item.tribunal)
              ? { tribunal: item.tribunal }
              : {}),
            ...(item.ruc ? { ruc: item.ruc } : {}),
          },
        });
        linked.push(causaId);
      }
      itemsWithIds.push({ ...item, causaId });
      causaIdsForSync.push(causaId);
    }

    let syncResults: Array<{
      causaId: string;
      status: string;
      note?: string;
      inserted?: number;
      cuadernosCoverage?: PjudCuadernosCoverage;
      documents?: import("./sync").SyncCausaResult["documents"];
    }> = [];
    let enqueued = 0;
    let sessionUncovered = 0;

    if (opts?.syncMovimientos !== false && causaIdsForSync.length) {
      phase = "queue";
      // Enqueue durable jobs instead of N serial scrapes (avoids proxy timeouts).
      // Todas las causas seleccionadas entran en cola, incluidas terminadas
      // que el cron periódico no volvería a seleccionar por sí solo.
      const jobs: Awaited<ReturnType<typeof enqueueDueSyncJobs>> = [];
      const uniqueIds = [...new Set(causaIdsForSync)];
      for (let offset = 0; offset < uniqueIds.length; offset += 100) {
        await assertPjudManagementEnabled();
  await opts?.sessionSource?.assertActive?.();
        const batch = uniqueIds.slice(offset, offset + 100);
        jobs.push(...await enqueueDueSyncJobs({
          causaIds: batch,
          trigger: opts?.sessionSource ? PJUD_MANUAL_SESSION_TRIGGER : "manual",
          limit: batch.length,
          ...(opts?.sessionSource ? { reclaimStuckRunning: false } : {}),
          onJobEnqueued: jobId => { enqueuedJobIds.push(jobId); },
        }));
      }
      enqueued = jobs.length;
      if (opts?.processJobsInline) {
        const processed: Awaited<ReturnType<typeof processPendingSyncJobs>> = [];
        // Every session-backed job must finish while its browser context exists.
        const batches = opts?.sessionSource
          ? Array.from({ length: Math.ceil(jobs.length / 40) }, (_, index) => jobs.slice(index * 40, (index + 1) * 40))
          : [jobs];
        for (const batch of batches) {
          await assertPjudManagementEnabled();
  await opts?.sessionSource?.assertActive?.();
          processed.push(...await processPendingSyncJobs({
            actorId: opts?.actorId,
            limit: Math.min(batch.length || 20, 40),
            jobIds: batch.map((job) => job.id),
            fetchMovimientos: opts?.sessionSource?.fetchMovimientos,
            assertActive: opts?.sessionSource?.assertActive,
            downloadDocuments: opts?.sessionSource?.downloadDocuments,
            ...(opts?.sessionSource ? { concurrency: 1 } : {}),
          }));
        }
        syncResults = processed.map((r) => ({
          causaId: r.causaId,
          status: r.status,
          note: r.note,
          inserted: r.inserted,
          cuadernosCoverage: r.cuadernosCoverage,
          documents: r.documents,
        }));
        if (opts?.sessionSource) {
          // An active job may have prevented enqueueing, or another worker may
          // have claimed a new job. Neither case was fetched by this session.
          const covered = new Set(syncResults.map((result) => result.causaId));
          for (const causaId of uniqueIds) {
            if (covered.has(causaId)) continue;
            sessionUncovered += 1;
            syncResults.push({
              causaId,
              status: "failed",
              inserted: 0,
              note: "La causa ya tiene una actualización pendiente o en curso. Espere a que termine y vuelva a sincronizar con la sesión abierta.",
            });
          }
        }
      }
    }

    const syncFailed = syncResults.filter(
      (r) => r.status === "failed" || r.status === "error"
    ).length;
    const syncPartial = syncResults.filter(r => r.status === "partial").length;
    const syncOk = syncResults.length - syncFailed - syncPartial;
    const insertedTotal = syncResults.reduce(
      (sum, r) => sum + (r.inserted || 0),
      0
    );
    let lastSyncStatus: string = "ok";
    if (syncResults.length > 0 && syncFailed === syncResults.length) {
      lastSyncStatus = "failed";
    } else if (syncFailed > 0 || syncPartial > 0) {
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
      if (syncFailed === 0 && syncPartial === 0) {
        noteParts.push(
          `movimientos recuperados (+${insertedTotal} nuevo${insertedTotal === 1 ? "" : "s"})`
        );
      } else if (syncFailed === syncResults.length) {
        noteParts.push(
          `no se pudieron actualizar los movimientos (${syncFailed} con error)`
        );
      } else {
        noteParts.push(
          `${syncOk} actualizadas, ${syncPartial} con cuadernos pendientes, ${syncFailed} con error (+${insertedTotal} movimientos nuevos)`
        );
      }
    }
    if (sessionUncovered) {
      noteParts.push(
        `${sessionUncovered} causa${sessionUncovered === 1 ? "" : "s"} con una actualización pendiente o en curso no se pudieron consultar en esta sesión; espere a que termine y vuelva a sincronizar`
      );
    }

    const finished = await prisma.firmSettings.updateMany({
      // Un proceso viejo no debe sobrescribir el estado de un claim nuevo ni
      // volver a marcar conectada una cuenta cuyos datos se eliminaron.
      where: claimWhere,
      data: {
        claveUnicaLastSyncAt: new Date(),
        claveUnicaLastSyncStatus: lastSyncStatus,
        claveUnicaLastSyncNote: `${noteParts.join(". ")}.`,
      },
    });
    if (!finished.count) {
      throw httpError(
        "La sincronización fue reemplazada o la conexión se eliminó. Revise su estado antes de reintentar.",
        409
      );
    }

    return {
      listed: items.length,
      created: created.length,
      linked: linked.length,
      enqueued,
      enqueuedJobIds,
      syncOk,
      syncFailed,
      syncPartial,
      inserted: insertedTotal,
      items: itemsWithIds,
      syncResults,
    };
  } catch (error) {
    if (opts?.sessionSource && enqueuedJobIds.length) {
      // These pending jobs require this ephemeral browser. Never leave them for
      // an unrelated cron/provider after cancellation, or take over running jobs.
      await prisma.pjudSyncJob.updateMany({
        where: { id: { in: enqueuedJobIds }, trigger: PJUD_MANUAL_SESSION_TRIGGER, status: "pending" },
        data: {
          status: "failed", finishedAt: new Date(),
          note: "La actualización de esta sesión no se completó. Inicie sesión de nuevo para reintentar.",
          lastError: "La actualización de esta sesión no se completó. Inicie sesión de nuevo para reintentar.",
        },
      });
    }
    const imported = created.length + linked.length;
    let note = "No se pudo consultar Mis Causas. Vuelva a intentarlo.";
    if (phase === "scrape" && error instanceof Error && "status" in error) {
      // Sólo los errores curados (httpError/PjudScrapeError) van al estado
      // visible; no guardar mensajes de Prisma ni respuestas ajenas completas.
      note = error.message.slice(0, 1000);
    } else if (phase !== "scrape") {
      note = phase === "queue"
        ? "No se pudo completar la actualización de movimientos."
        : "No se pudo completar la importación de causas.";
      note += imported
        ? ` Se conservaron ${imported} causa(s) importadas o vinculadas; puede reintentar.`
        : " Vuelva a intentarlo.";
    }
    await prisma.firmSettings.updateMany({
      where: claimWhere,
      data: {
        claveUnicaLastSyncAt: new Date(),
        claveUnicaLastSyncStatus: imported ? "partial" : "failed",
        claveUnicaLastSyncNote: note,
      },
    });
    throw error;
  }
}

/** Causas marcadas como importadas/enlazadas desde Mis Causas (ClaveÚnica). */
export async function listCausasFromMisCausas(limit = 80) {
  return prisma.causa.findMany({
    where: { pjudFromMisCausas: true },
    select: {
      id: true,
      rit: true,
      tribunal: true,
      titulo: true,
      caratula: true,
      estado: true,
      pjudLastSyncStatus: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
    take: Math.min(Math.max(limit, 1), 200),
  });
}
