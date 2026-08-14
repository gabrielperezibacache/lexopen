import { classifyMovimiento } from "@/lib/pjud/classify";
import { fingerprint, type PjudFetchedMovimiento } from "@/lib/pjud/types";
import { parseLocalDateInput } from "@/lib/minutas";
import { pickTribunalFromTexts } from "@/lib/pjud/ojv-dom";

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
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  const dotted = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (dotted) {
    const year = dotted[3].length === 2 ? `20${dotted[3]}` : dotted[3];
    return `${year}-${dotted[2].padStart(2, "0")}-${dotted[1].padStart(2, "0")}`;
  }
  const months: Record<string, string> = {
    enero: "01",
    febrero: "02",
    marzo: "03",
    abril: "04",
    mayo: "05",
    junio: "06",
    julio: "07",
    agosto: "08",
    septiembre: "09",
    setiembre: "09",
    octubre: "10",
    noviembre: "11",
    diciembre: "12",
  };
  const long = trimmed.match(
    /^(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+de\s+(\d{4})$/i
  );
  if (long) {
    const mon = months[long[2].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")];
    if (mon) {
      return `${long[3]}-${mon}-${long[1].padStart(2, "0")}`;
    }
  }
  return null;
}

function cellLooksLikeDate(c: string) {
  return (
    /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(c) ||
    /^\d{1,2}\.\d{1,2}\.\d{2,4}$/.test(c) ||
    /\d{4}-\d{2}-\d{2}/.test(c) ||
    /^\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+\d{4}$/i.test(c)
  );
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

/** Absolute OJV download URL from a table row's anchors (href / onclick). */
export function extractDocumentoHrefFromRowHtml(rowHtml: string): string | null {
  const resolve = (href: string): string | null => {
    const value = href.trim();
    if (!value || value === "#" || /^javascript:/i.test(value)) return null;
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith("//")) return `https:${value}`;
    if (value.startsWith("/")) {
      return `https://oficinajudicialvirtual.pjud.cl${value}`;
    }
    // Relative paths from OJV modal / includes
    const cleaned = value.replace(/^\.\//, "").replace(/^(\.\.\/)+/, "");
    return `https://oficinajudicialvirtual.pjud.cl/${cleaned}`;
  };

  const looksLikeDoc = (href: string, text: string) =>
    /\.(pdf|doc|docx)(\?|$)/i.test(href) ||
    /documento|descarg|archivo|anexo|escrito|ebook|pdf|folio/i.test(href) ||
    /descarg|pdf|documento|ver\s*doc|anexo|escrito/i.test(text);

  const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorRe.exec(rowHtml)) !== null) {
    const attrs = match[1] || "";
    const text = stripTags(match[2] || "").toLowerCase();
    const hrefMatch = attrs.match(/href\s*=\s*["']([^"']+)["']/i);
    const href = hrefMatch?.[1]?.trim() || "";
    if (href && looksLikeDoc(href, text)) {
      const resolved = resolve(href);
      if (resolved) return resolved;
    }
    // onclick="window.open('…')" / location.href='…'
    const onclickMatch =
      attrs.match(/onclick\s*=\s*"([^"]*)"/i) ||
      attrs.match(/onclick\s*=\s*'([^']*)'/i);
    if (onclickMatch) {
      const js = onclickMatch[1];
      const fromJs =
        js.match(
          /(?:window\.open|open|location\.href\s*=|href\s*=)\s*\(?\s*['"]([^'"]+)['"]/i
        ) ||
        js.match(/['"](https?:\/\/[^'"]+\.(?:pdf|doc|docx)[^'"]*)['"]/i) ||
        js.match(
          /['"](\/?[^'"]*(?:documento|descarg|ebook|anexo|archivo|\.pdf)[^'"]*)['"]/i
        );
      if (fromJs?.[1] && looksLikeDoc(fromJs[1], text || "documento")) {
        const resolved = resolve(fromJs[1]);
        if (resolved) return resolved;
      }
    }
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

    const fechaRaw = cells.find((c) => cellLooksLikeDate(c));
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
      pickTribunalFromTexts(cells) || "Tribunal no identificado";
    if (/sin tribunal/i.test(tribunal)) continue;
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

/**
 * Fallback cuando Mis Causas no usa `<table>` clásica (cards / divs).
 * Busca RIT + tribunal en ventanas de texto plano del HTML.
 */
export function parseMisCausasLooseFromHtml(html: string): Array<{
  rit: string;
  tribunal: string;
  caratula?: string | null;
  ruc?: string | null;
  estado?: string | null;
}> {
  const text = stripTags(html);
  const items: Array<{
    rit: string;
    tribunal: string;
    caratula?: string | null;
    ruc?: string | null;
    estado?: string | null;
  }> = [];
  const seen = new Set<string>();
  const ritRe = /\b([A-ZÁÉÍÓÚÑ]{1,4}-\d{1,6}-\d{4}|\d{1,6}-\d{4})\b/gi;
  let match: RegExpExecArray | null;
  while ((match = ritRe.exec(text)) !== null) {
    const rit = match[1].toUpperCase();
    if (/^\d{1,2}-\d{4}$/.test(rit)) continue; // fechas dd-yyyy raras
    const start = Math.max(0, match.index - 220);
    const end = Math.min(text.length, match.index + match[0].length + 320);
    const window = text.slice(start, end);
    const tribunalMatch = window.match(
      /\b(\d{0,2}\s*[ºo°.]?\s*(?:Juzgado|Tribunal|Corte|JPL|Polic[ií]a\s+Local)[^|]{0,80})/i
    );
    const tribunal =
      pickTribunalFromTexts([
        tribunalMatch?.[1] || "",
        window.slice(0, 120),
        window.slice(-120),
      ]) || "Tribunal no identificado";
    const key = `${rit}|${tribunal}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const rucMatch = window.match(/\b(\d{1,3}-\d{8,}-\d|\d{7,8}-[\dkK])\b/i);
    const estadoMatch = window.match(
      /\b(Tramitaci[oó]n|Terminad[oa]|Archivad[oa]|Vigente|Activa|Concluida)\b/i
    );
    items.push({
      rit,
      tribunal,
      caratula: null,
      ruc: rucMatch?.[1] || null,
      estado: estadoMatch?.[1] || null,
    });
  }
  return items;
}

export type MisCausasParsedItem = {
  rit: string;
  tribunal: string;
  caratula?: string | null;
  ruc?: string | null;
  estado?: string | null;
};

/**
 * Merge verDetalle + table list + loose card parsers (dedupe by rit|tribunal).
 * Avoids early-return on a partial `#verDetalleJuridica` missing Mis Causas rows.
 */
export function parseMisCausasFromHtml(html: string): MisCausasParsedItem[] {
  const seen = new Set<string>();
  const out: MisCausasParsedItem[] = [];
  const push = (items: MisCausasParsedItem[]) => {
    for (const item of items) {
      if (!item.rit) continue;
      const key = `${item.rit}|${item.tribunal}`.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        rit: item.rit,
        tribunal: item.tribunal,
        caratula: item.caratula ?? null,
        ruc: item.ruc ?? null,
        estado: item.estado ?? null,
      });
    }
  };
  push(
    parseVerDetalleJuridicaHtml(html).map((r) => ({
      rit: r.rit,
      tribunal: r.tribunal,
      caratula: r.caratula,
      ruc: r.ruc,
      estado: r.estado,
    }))
  );
  push(parseCausasListFromHtml(html));
  push(parseMisCausasLooseFromHtml(html));
  return out;
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
      pickTribunalFromTexts(dataCells) || "Tribunal no identificado";
    const key = `${rit}|${tribunal}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const fechaRaw = dataCells.find((c) => cellLooksLikeDate(c)) || null;
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
