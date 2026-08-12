import { prisma } from "@/lib/db";
import { decryptSecret, encryptSecret, maskRut } from "@/lib/pjud/secret";
import {
  scrapeMisCausasWithClaveUnica,
  type MisCausasItem,
} from "@/lib/pjud/public-scrape";
import { fetchMisCausasFromSidecar } from "@/lib/pjud/scraper-sidecar";
import { syncCausaPjud } from "@/lib/pjud/sync";

async function getOrCreateFirmSettings() {
  const org =
    (await prisma.organization.findFirst({ include: { settings: true } })) ||
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
    sidecar: Boolean(process.env.PJUD_SCRAPER_URL?.trim()),
  };
}

export async function saveClaveUnicaCredentials(opts: {
  rut: string;
  password: string;
  enabled?: boolean;
}) {
  const { settings } = await getOrCreateFirmSettings();
  const rut = opts.rut.trim();
  if (!/^[\d.]{7,12}-[\dkK]$/.test(rut.replace(/\./g, ""))) {
    // soft check — allow dotted RUT
    if (!/\d/.test(rut)) throw new Error("RUT ClaveÚnica inválido");
  }
  return prisma.firmSettings.update({
    where: { id: settings.id },
    data: {
      claveUnicaRut: rut,
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
  const password = decryptSecret(settings.claveUnicaPasswordEnc);
  if (!password) {
    throw new Error("No se pudo descifrar la contraseña ClaveÚnica.");
  }

  const fromSidecar = await fetchMisCausasFromSidecar({
    rut: settings.claveUnicaRut,
    password,
  });
  if (fromSidecar) return fromSidecar;

  return scrapeMisCausasWithClaveUnica({
    rut: settings.claveUnicaRut,
    password,
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
  const syncResults = [];

  for (const item of items) {
    const existing = await prisma.causa.findFirst({
      where: {
        OR: [
          { rit: item.rit, tribunal: item.tribunal },
          ...(item.ruc ? [{ ruc: item.ruc, tribunal: item.tribunal }] : []),
        ],
      },
      select: { id: true },
    });

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
        },
      });
      linked.push(causaId);
    }

    if (opts?.syncMovimientos !== false) {
      try {
        syncResults.push(
          await syncCausaPjud(causaId, {
            actorId: opts?.actorId,
            force: true,
            trigger: "manual",
          })
        );
      } catch (error) {
        syncResults.push({
          causaId,
          status: "failed",
          note: error instanceof Error ? error.message : "Error sync",
          inserted: 0,
        });
      }
    }
  }

  await prisma.firmSettings.update({
    where: { id: settings.id },
    data: {
      claveUnicaLastSyncAt: new Date(),
      claveUnicaLastSyncStatus: "ok",
      claveUnicaLastSyncNote: `Mis Causas: ${items.length} listadas · ${created.length} nuevas · ${linked.length} ya existentes.`,
    },
  });

  return {
    listed: items.length,
    created: created.length,
    linked: linked.length,
    items,
    syncResults,
  };
}
