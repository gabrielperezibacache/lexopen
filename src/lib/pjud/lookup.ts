import { prisma } from "@/lib/db";
import { validarRit, validarRut } from "@/lib/chile";
import {
  scrapeCausaByRol,
  scrapeCausasByRut,
  publicScrapeReady,
} from "@/lib/pjud/public-scrape";
import { fetchFromScraperSidecar, buscarCausasByRutFromSidecar, scraperSidecarConfigured } from "@/lib/pjud/scraper-sidecar";
import { syncCausaPjud } from "@/lib/pjud/sync";
import type { MisCausasItem } from "@/lib/pjud/types";

export type LookupCreateResult = {
  causaId: string;
  created: boolean;
  sync: Awaited<ReturnType<typeof syncCausaPjud>> | null;
  note: string;
};

/**
 * CausaMonitor-like: add by ROL + tribunal, enable monitoring, sync immediately.
 */
export async function addCausaByRol(opts: {
  rit: string;
  tribunal: string;
  titulo?: string;
  ruc?: string | null;
  materia?: string;
  actorId?: string | null;
  syncNow?: boolean;
}): Promise<LookupCreateResult> {
  const rit = opts.rit.trim().toUpperCase();
  if (!validarRit(rit)) throw new Error("RIT/ROL inválido");
  const tribunal = opts.tribunal.trim();
  if (!tribunal) throw new Error("Tribunal requerido");

  const existing = await prisma.causa.findFirst({
    where: {
      OR: [
        { rit, tribunal },
        ...(opts.ruc ? [{ ruc: opts.ruc, tribunal }] : []),
      ],
    },
    select: { id: true },
  });

  let causaId = existing?.id;
  let created = false;
  if (!causaId) {
    const row = await prisma.causa.create({
      data: {
        titulo: opts.titulo?.trim() || rit,
        rit,
        ruc: opts.ruc || null,
        tribunal,
        materia: opts.materia || "Por clasificar",
        pjudMonitoreoActivo: true,
        pjudLastSyncStatus: "never",
        pjudLastSyncNote: "Alta rápida por ROL (flujo CausaMonitor).",
      },
    });
    causaId = row.id;
    created = true;
  } else {
    await prisma.causa.update({
      where: { id: causaId },
      data: { pjudMonitoreoActivo: true },
    });
  }

  let sync = null;
  if (opts.syncNow !== false) {
    sync = await syncCausaPjud(causaId, {
      actorId: opts.actorId,
      force: true,
      trigger: "manual",
    });
  }

  return {
    causaId,
    created,
    sync,
    note: created
      ? `Causa ${rit} creada y monitoreada.`
      : `Causa ${rit} ya existía; monitoreo activado.`,
  };
}

export async function buscarPorRut(rut: string): Promise<MisCausasItem[]> {
  if (!validarRut(rut) && !validarRut(rut.replace(/\./g, ""))) {
    // try dashed normalize
    const n = rut.replace(/\./g, "").replace(/\s/g, "").toUpperCase();
    const dashed = n.includes("-") ? n : `${n.slice(0, -1)}-${n.slice(-1)}`;
    if (!validarRut(dashed)) throw new Error("RUT inválido");
  }

  if (scraperSidecarConfigured()) {
    try {
      const causas = await buscarCausasByRutFromSidecar(rut);
      if (causas?.length) return causas;
    } catch {
      // fall through to in-process scrape
    }
  }

  if (!publicScrapeReady()) {
    throw new Error(
      "Búsqueda por RUT requiere scrape listo (PJUD_PUBLIC_SCRAPE + CAPTCHA) o sidecar /causas/buscar."
    );
  }
  return scrapeCausasByRut(rut);
}

/** Preview scrape without persisting — useful before create. */
export async function previewRolLookup(opts: {
  rit: string;
  tribunal: string;
  ruc?: string | null;
}) {
  const causaRef = {
    id: "preview",
    rit: opts.rit.trim().toUpperCase(),
    ruc: opts.ruc || null,
    tribunal: opts.tribunal.trim(),
    titulo: opts.rit,
    caratula: null,
  };
  if (scraperSidecarConfigured()) {
    const fromSidecar = await fetchFromScraperSidecar(causaRef);
    if (fromSidecar) {
      return {
        provider: fromSidecar.provider,
        count: fromSidecar.movimientos.length,
        sala: fromSidecar.sala || null,
        note: fromSidecar.note,
        sample: fromSidecar.movimientos.slice(0, 5).map((m) => ({
          titulo: m.titulo,
          fecha: m.fecha.toISOString().slice(0, 10),
          cuaderno: m.cuaderno,
          esReceptor: m.esReceptor,
        })),
      };
    }
  }
  if (!publicScrapeReady()) {
    throw new Error("Sin scrape/sidecar para previsualizar.");
  }
  const scraped = await scrapeCausaByRol(causaRef);
  return {
    provider: "scrape" as const,
    count: scraped.movimientos.length,
    sala: scraped.sala,
    note: scraped.note,
    sample: scraped.movimientos.slice(0, 5).map((m) => ({
      titulo: m.titulo,
      fecha: m.fecha.toISOString().slice(0, 10),
      cuaderno: m.cuaderno,
      esReceptor: m.esReceptor,
    })),
  };
}
