import { classifyMovimiento } from "@/lib/pjud/classify";
import { fingerprint, type PjudFetchedMovimiento } from "@/lib/pjud/types";
import { parseLocalDateInput } from "@/lib/minutas";

function stripTags(s: string) {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeChileanDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const m = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!m) return null;
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

function isHeaderRow(cells: string[]) {
  const joined = cells.join(" ").toLowerCase();
  const looksLikeColumnHeader =
    cells.length <= 6 &&
    /^(folio|fecha|tr[aá]mite|etapa|descargar|documento|cuaderno)/i.test(
      cells[0] || ""
    );
  const looksLikeHeaderSentence =
    /fecha/.test(joined) && /tr[aá]mite|folio|historia/.test(joined);
  return looksLikeColumnHeader || looksLikeHeaderSentence;
}

/** Absolute OJV download URL from a table row's anchors (href). */
export function extractDocumentoHrefFromRowHtml(rowHtml: string): string | null {
  const anchorRe = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorRe.exec(rowHtml)) !== null) {
    const href = (match[1] || "").trim();
    if (!href || href === "#" || /^javascript:/i.test(href)) continue;
    const text = stripTags(match[2] || "").toLowerCase();
    const looksLikeDoc =
      /\.(pdf|doc|docx)(\?|$)/i.test(href) ||
      /documento|descarg|archivo|anexo|escrito|pdf/i.test(href) ||
      /descarg|pdf|documento|ver\s*doc/i.test(text);
    if (!looksLikeDoc) continue;
    if (/^https?:\/\//i.test(href)) return href;
    if (href.startsWith("/")) {
      return `https://oficinajudicialvirtual.pjud.cl${href}`;
    }
    return `https://oficinajudicialvirtual.pjud.cl/${href.replace(/^\.\//, "")}`;
  }
  return null;
}

/**
 * Parse OJV/historiales HTML tables into movimientos.
 * Rows without a parseable fecha are skipped (never invent "today").
 */
export function parseMovimientosFromHtml(html: string): PjudFetchedMovimiento[] {
  const movimientos: PjudFetchedMovimiento[] = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
  let rowMatch: RegExpExecArray | null;
  let folioSeq = 0;

  while ((rowMatch = rowRe.exec(html)) !== null) {
    const cells: string[] = [];
    let cellMatch: RegExpExecArray | null;
    cellRe.lastIndex = 0;
    while ((cellMatch = cellRe.exec(rowMatch[1])) !== null) {
      cells.push(stripTags(cellMatch[1]));
    }
    if (cells.length < 2) continue;
    if (isHeaderRow(cells)) continue;

    const joined = cells.join(" | ");
    if (
      /tribunal|car[aá]tula|litigante|^rol\b|^rit\b/i.test(joined) &&
      cells.length <= 4 &&
      !/\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(joined)
    ) {
      continue;
    }

    const fechaRaw =
      cells.find((c) => /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(c)) ||
      cells.find((c) => /\d{4}-\d{2}-\d{2}/.test(c));
    if (!fechaRaw) continue;
    const normalized = normalizeChileanDate(fechaRaw);
    if (!normalized) continue;
    const fecha = parseLocalDateInput(normalized);
    if (!fecha) continue;

    const titulo =
      cells.find(
        (c) =>
          c.length > 8 &&
          !/^\d+$/.test(c) &&
          !/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(c) &&
          !/^\d{4}-\d{2}-\d{2}/.test(c)
      ) || cells[cells.length - 1];
    if (!titulo || titulo.length < 4) continue;
    if (/^(folio|fecha|trámite|tramite|etapa|descargar)$/i.test(titulo)) continue;

    folioSeq += 1;
    const classified = classifyMovimiento(titulo, joined);
    const esReceptor =
      classified.tipo === "notificacion" ||
      /receptor|c[eé]dula|notificaci[oó]n/i.test(titulo);
    const pendienteResolucion = Boolean(classified.pendienteResolucion);
    const cuaderno =
      cells.find((c) => /principal|apelaci[oó]n|incidente|exhorto/i.test(c)) ||
      "Principal";
    const folioCandidate = cells.find(
      (c, idx) => idx === 0 && /^\d{1,5}$/.test(c)
    );
    const folio = folioCandidate || String(folioSeq);
    const documentoRef = extractDocumentoHrefFromRowHtml(rowMatch[1]);

    movimientos.push({
      externalId: `scrape:${fingerprint(titulo, fecha, folio)}`,
      titulo,
      detalle: joined.slice(0, 4000),
      fecha,
      referencia: folio,
      tipo: classified.tipo,
      relevante: classified.relevante || esReceptor || pendienteResolucion,
      fuente: "pjud",
      cuaderno,
      folio,
      etapa:
        cells.find((c) => /etapa|ingreso|traslado|audiencia/i.test(c)) || null,
      tramite:
        cells.find((c) =>
          /prove[ií]do|resoluci[oó]n|escrito|c[eé]dula/i.test(c)
        ) || null,
      esReceptor,
      pendienteResolucion,
      documentoRef,
    });
  }

  return movimientos.slice(0, 500);
}

/** Best-effort sala extraction from detail HTML. */
export function parseSalaFromHtml(html: string): string | null {
  const text = stripTags(html);
  const m =
    text.match(/\bSala\s*[:\-]?\s*([A-Za-z0-9º°.\-\s]{1,40})/i) ||
    text.match(/\bSala\s+(\d{1,3})\b/i);
  if (!m) return null;
  return m[1].trim().slice(0, 80);
}

export function parseCausasListFromHtml(html: string): Array<{
  rit: string;
  tribunal: string;
  caratula?: string | null;
  ruc?: string | null;
  estado?: string | null;
}> {
  const items: Array<{
    rit: string;
    tribunal: string;
    caratula?: string | null;
    ruc?: string | null;
    estado?: string | null;
  }> = [];
  const seen = new Set<string>();
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
    if (cells.length < 2 || isHeaderRow(cells)) continue;
    const joined = cells.join(" ");
    const ritMatch =
      joined.match(/\b([A-Z]{1,3}-\d{1,6}-\d{4})\b/i) ||
      joined.match(/\b(\d{1,6}-\d{4})\b/);
    if (!ritMatch) continue;
    const rit = ritMatch[1].toUpperCase();
    const tribunal =
      cells.find((c) =>
        /juzgado|corte de|tribunal oral|tribunal constitucional|^tribunal\b/i.test(
          c
        )
      ) || null;
    if (!tribunal || /sin tribunal/i.test(tribunal)) continue;
    const key = `${rit}|${tribunal}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      rit,
      tribunal,
      caratula: cells.find((c) => /\bvs\.?\b|\/|con\b/i.test(c)) || cells[0],
      ruc: cells.find((c) => /\d{1,3}-\d{8,}-\d/.test(c)) || null,
      estado: cells.find((c) => /tramitaci|terminad|archiv/i.test(c)) || null,
    });
  }
  return items;
}

export type VerDetalleRow = {
  rit: string;
  tribunal: string;
  caratula: string | null;
  ruc: string | null;
  estado: string | null;
  fecha: string | null;
  fechaDate: Date | null;
};

/**
 * Parse `#verDetalleJuridica` result rows (Consulta Unificada OJV).
 * First TD is usually the detail link; remaining TDs vary by competencia.
 */
export function parseVerDetalleJuridicaHtml(html: string): VerDetalleRow[] {
  const out: VerDetalleRow[] = [];
  const tableMatch =
    html.match(
      /id=["']verDetalleJuridica["'][^>]*>([\s\S]*?)(?:<\/table>|<\/tbody>)/i
    ) || html.match(/verDetalleJuridica[\s\S]*?<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  const chunk = tableMatch?.[1] || html;
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
  let rowMatch: RegExpExecArray | null;
  const seen = new Set<string>();

  while ((rowMatch = rowRe.exec(chunk)) !== null) {
    if (/pagination|<nav/i.test(rowMatch[1])) continue;
    const cells: string[] = [];
    let cellMatch: RegExpExecArray | null;
    cellRe.lastIndex = 0;
    while ((cellMatch = cellRe.exec(rowMatch[1])) !== null) {
      cells.push(stripTags(cellMatch[1]));
    }
    if (cells.length < 2) continue;
    // Skip leading empty / icon cell when present
    const dataCells =
      cells[0].length <= 2 || /ver|detalle|^\s*$/i.test(cells[0])
        ? cells.slice(1)
        : cells;
    const joined = dataCells.join(" ");
    const ritMatch =
      joined.match(/\b([A-ZÁÉÍÓÚÑ]{1,4}-\d{1,6}-\d{4})\b/i) ||
      joined.match(/\b(\d{1,6}-\d{4})\b/);
    if (!ritMatch) continue;
    const rit = ritMatch[1].toUpperCase();
    const tribunal =
      dataCells.find((c) =>
        /juzgado|corte|tribunal oral|tribunal constitucional|^tribunal\b/i.test(c)
      ) ||
      dataCells.find((c) => /civil|laboral|cobranza|garant/i.test(c)) ||
      "Tribunal no identificado";
    const key = `${rit}|${tribunal}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const fechaRaw =
      dataCells.find((c) => /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(c)) || null;
    const fechaNorm = fechaRaw ? normalizeChileanDate(fechaRaw) : null;
    out.push({
      rit,
      tribunal,
      caratula:
        dataCells.find((c) => /\bvs\.?\b|\/|con\b/i.test(c)) ||
        dataCells.find((c) => c.length > 8 && c !== rit && c !== tribunal) ||
        null,
      ruc: dataCells.find((c) => /\d{1,3}-\d{8,}-\d|\d{7,8}-[\dkK]/i.test(c)) || null,
      estado:
        dataCells.find((c) => /tramitaci|terminad|archiv|vigente|activ/i.test(c)) ||
        null,
      fecha: fechaNorm,
      fechaDate: fechaNorm ? parseLocalDateInput(fechaNorm) : null,
    });
  }
  return out;
}
