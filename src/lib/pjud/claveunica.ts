import { prisma } from "@/lib/db";
import { validarRut } from "@/lib/chile";
import { decryptSecret, encryptSecret, maskRut } from "@/lib/pjud/secret";
import {
  scrapeMisCausasWithClaveUnica,
  type MisCausasItem,
} from "@/lib/pjud/public-scrape";
import {
  fetchMisCausasFromSidecar,
  scraperSidecarConfigured,
} from "@/lib/pjud/scraper-sidecar";
import { enqueueDueSyncJobs, processPendingSyncJobs } from "@/lib/pjud/queue";

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
  return {
    enabled: settings.claveUnicaEnabled,
    rutMasked: maskRut(settings.claveUnicaRut),
    hasPassword: Boolean(settings.claveUnicaPasswordEnc),
    lastSyncAt: settings.claveUnicaLastSyncAt,
    lastSyncStatus: settings.claveUnicaLastSyncStatus,
    lastSyncNote: settings.claveUnicaLastSyncNote,
    scrapeFlag: process.env.PJUD_CLAVEUNICA_SCRAPE === "1",
    sidecar: scraperSidecarConfigured(),
  };
}

export async function saveClaveUnicaCredentials(opts: {
  rut: string;
  password: string;
  enabled?: boolean;
}) {
  const { settings } = await getOrCreateFirmSettings();
  const raw = opts.rut.trim();
  const normalized = raw.replace(/\./g, "").replace(/\s/g, "").toUpperCase();
  const dashed = normalized.includes("-")
    ? normalized
    : `${normalized.slice(0, -1)}-${normalized.slice(-1)}`;
  if (!validarRut(raw) && !validarRut(dashed)) {
    throw new Error("RUT ClaveÚnica inválido");
  }
  const storedRut = validarRut(raw) ? raw : dashed;
  return prisma.firmSettings.update({
    where: { id: settings.id },
    data: {
      claveUnicaRut: storedRut,
      claveUnicaPasswordEnc: encryptSecret(opts.password),
      claveUnicaEnabled: opts.enabled ?? true,
      claveUnicaLastSyncNote: "Credenciales actualizadas (AES-GCM).",
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
      claveUnicaLastSyncNote: "Credenciales ClaveÚnica eliminadas.",
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
    throw new Error("ClaveÚnica deshabilitada en el estudio.");
  }
  if (!settings.claveUnicaRut || !settings.claveUnicaPasswordEnc) {
    throw new Error("Configure RUT y contraseña ClaveÚnica primero.");
  }
  const password = decryptSecret(settings.claveUnicaPasswordEnc, {
    strict: true,
  });
  if (!password) {
    throw new Error(
      "No se pudo descifrar la contraseña ClaveÚnica (re-guarde con PJUD_SECRETS_KEY/SESSION_SECRET)."
    );
  }

  if (scraperSidecarConfigured()) {
    try {
      const fromSidecar = await fetchMisCausasFromSidecar({
        rut: settings.claveUnicaRut,
        password,
      });
      if (fromSidecar) return fromSidecar;
    } catch (error) {
      if (process.env.PJUD_CLAVEUNICA_SCRAPE !== "1") throw error;
    }
  }

  return scrapeMisCausasWithClaveUnica({
    rut: settings.claveUnicaRut,
    password,
  });
}

async function findExistingCausa(item: MisCausasItem) {
  if (item.ruc) {
    const byRuc = await prisma.causa.findFirst({
      where: { ruc: item.ruc },
      select: { id: true },
    });
    if (byRuc) return byRuc;
  }
  const byRitTribunal = await prisma.causa.findFirst({
    where: { rit: item.rit, tribunal: item.tribunal },
    select: { id: true },
  });
  if (byRitTribunal) return byRitTribunal;
  return prisma.causa.findFirst({
    where: { rit: item.rit },
    select: { id: true },
  });
}

export async function syncMisCausas(opts?: {
  actorId?: string | null;
  syncMovimientos?: boolean;
}) {
  const { settings } = await getOrCreateFirmSettings();
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
    // Enqueue durable jobs instead of N serial scrapes (avoids cron timeouts).
    const jobs = await enqueueDueSyncJobs({
      causaIds: causaIdsForSync,
      trigger: "cron",
      limit: Math.min(causaIdsForSync.length, 100),
    });
    enqueued = jobs.length;
    const processed = await processPendingSyncJobs({
      actorId: opts?.actorId,
      limit: Math.min(jobs.length || 20, 40),
      jobIds: jobs.map((j) => j.id),
      concurrency: 2,
    });
    syncResults = processed.map((r) => ({
      causaId: r.causaId,
      status: r.status,
      note: r.note,
      inserted: r.inserted,
    }));
  }

  await prisma.firmSettings.update({
    where: { id: settings.id },
    data: {
      claveUnicaLastSyncAt: new Date(),
      claveUnicaLastSyncStatus: "ok",
      claveUnicaLastSyncNote: `Mis Causas: ${items.length} listadas · ${created.length} nuevas · ${linked.length} ya existentes · encoladas ${enqueued}.`,
    },
  });

  return {
    listed: items.length,
    created: created.length,
    linked: linked.length,
    enqueued,
    items,
    syncResults,
  };
}
