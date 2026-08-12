/**
 * Programación de salas (paridad CausaMonitor).
 * Empareja RITs de la cartera monitoreada con filas de tablas públicas
 * (Cortes de Apelaciones / Suprema). El scrape live del portal puede
 * alimentar `parseSalasTablaHtml`; aquí vive la lógica de matching.
 */

export type SalaTablaEntry = {
  rit: string;
  corte: string;
  fecha: string;
  sala?: string | null;
  caratula?: string | null;
  materia?: string | null;
};

export type MonitoredCausaRef = {
  id: string;
  rit: string | null;
  tribunal: string;
  titulo?: string;
};

export type SalaMatch = {
  causaId: string;
  rit: string;
  tribunal: string;
  entry: SalaTablaEntry;
};

/** Normaliza RIT/ROL para comparar (C-100-2024 ≈ c-100-2024). */
export function normalizeRitKey(rit: string | null | undefined) {
  if (!rit) return "";
  return rit.trim().toUpperCase().replace(/\s+/g, "").replace(/^ROL/, "");
}

function stripTags(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extrae filas RIT/fecha/sala/corte desde HTML de tablas de salas.
 * Tolera tablas simples con celdas tipo: ROL | Carátula | Fecha | Sala.
 */
export function parseSalasTablaHtml(
  html: string,
  opts?: { corteDefault?: string }
): SalaTablaEntry[] {
  const corteDefault = opts?.corteDefault || "Corte de Apelaciones";
  const entries: SalaTablaEntry[] = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRe.exec(html)) !== null) {
    const cells: string[] = [];
    let cellMatch: RegExpExecArray | null;
    cellRe.lastIndex = 0;
    while ((cellMatch = cellRe.exec(rowMatch[1])) !== null) {
      cells.push(stripTags(cellMatch[1]));
    }
    if (cells.length < 2) continue;
    const joined = cells.join(" | ");
    if (/^rol\b|^rit\b|car[aá]tula|fecha|sala/i.test(cells[0]) && cells.length <= 5) {
      continue;
    }
    const ritCell =
      cells.find((c) =>
        /^[A-Z]{0,3}-?\d{1,6}-\d{4}$/i.test(c.replace(/\s+/g, ""))
      ) || cells.find((c) => /\d{1,6}-\d{4}/.test(c));
    if (!ritCell) continue;
    const rit = ritCell.replace(/\s+/g, "").toUpperCase();
    const fechaRaw =
      cells.find((c) => /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(c)) ||
      cells.find((c) => /^\d{4}-\d{2}-\d{2}/.test(c));
    if (!fechaRaw) continue;
    const fecha = normalizeFecha(fechaRaw);
    if (!fecha) continue;
    const sala =
      cells.find((c) => /^sala\s*\d+/i.test(c) || /^[A-Z]?\d{1,3}$/.test(c)) ||
      null;
    const caratula =
      cells.find(
        (c) =>
          c.length > 8 &&
          c !== ritCell &&
          c !== fechaRaw &&
          c !== sala &&
          !/corte|apelaci/i.test(c)
      ) || null;
    const corte =
      cells.find((c) => /corte|suprema|apelaci/i.test(c)) || corteDefault;
    entries.push({
      rit,
      corte,
      fecha,
      sala,
      caratula,
      materia: /civil|laboral|penal|familia/i.test(joined)
        ? joined.match(/\b(civil|laboral|penal|familia)\b/i)?.[1] || null
        : null,
    });
  }
  return entries.slice(0, 500);
}

function normalizeFecha(raw: string): string | null {
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const m = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!m) return null;
  let y = Number(m[3]);
  if (y < 100) y += 2000;
  const d = String(m[1]).padStart(2, "0");
  const mo = String(m[2]).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

/** Cruza agenda de salas con causas monitoreadas (por RIT). */
export function matchMonitoredCausasToSalas(
  causas: MonitoredCausaRef[],
  agenda: SalaTablaEntry[]
): SalaMatch[] {
  const byRit = new Map<string, SalaTablaEntry[]>();
  for (const entry of agenda) {
    const key = normalizeRitKey(entry.rit);
    if (!key) continue;
    const list = byRit.get(key) || [];
    list.push(entry);
    byRit.set(key, list);
  }
  const matches: SalaMatch[] = [];
  for (const causa of causas) {
    const key = normalizeRitKey(causa.rit);
    if (!key) continue;
    const entries = byRit.get(key);
    if (!entries?.length) continue;
    for (const entry of entries) {
      matches.push({
        causaId: causa.id,
        rit: causa.rit!,
        tribunal: causa.tribunal,
        entry,
      });
    }
  }
  return matches;
}

export function formatSalaMatchNote(match: SalaMatch) {
  const { entry } = match;
  return `En tabla: ${entry.corte}${entry.sala ? ` · Sala ${entry.sala}` : ""} · ${entry.fecha}`;
}

/** Persiste matches de salas en la cartera (host LexOpen). */
export async function applySalaMatchesToCartera(
  agenda: SalaTablaEntry[],
  opts?: { causaIds?: string[] }
) {
  const { prisma } = await import("@/lib/db");
  const causas = await prisma.causa.findMany({
    where: {
      pjudMonitoreoActivo: true,
      estado: "activa",
      rit: { not: null },
      ...(opts?.causaIds?.length ? { id: { in: opts.causaIds } } : {}),
    },
    select: { id: true, rit: true, tribunal: true, titulo: true },
  });
  const matches = matchMonitoredCausasToSalas(causas, agenda);
  for (const match of matches) {
    const fecha = new Date(`${match.entry.fecha}T12:00:00`);
    await prisma.causa.update({
      where: { id: match.causaId },
      data: {
        proximaTabla: Number.isNaN(fecha.getTime()) ? null : fecha,
        proximaTablaNota: formatSalaMatchNote(match),
        ...(match.entry.sala ? { sala: match.entry.sala } : {}),
      },
    });
  }
  return { scanned: causas.length, matched: matches.length, matches };
}

/** Fixture HTML mínimo (tests / demo offline). */
export function demoSalasTablaHtml(opts?: {
  rit?: string;
  fecha?: string;
  sala?: string;
  corte?: string;
}) {
  const rit = opts?.rit || "C-100-2024";
  const fecha = opts?.fecha || "15/08/2026";
  const sala = opts?.sala || "Sala 3";
  const corte = opts?.corte || "Corte de Apelaciones de Santiago";
  return `<table>
  <tr><th>ROL</th><th>Carátula</th><th>Fecha</th><th>Sala</th><th>Corte</th></tr>
  <tr><td>${rit}</td><td>Pérez con Soto</td><td>${fecha}</td><td>${sala}</td><td>${corte}</td></tr>
  <tr><td>C-999-2020</td><td>Otra causa</td><td>16/08/2026</td><td>Sala 1</td><td>${corte}</td></tr>
</table>`;
}
