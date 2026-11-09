import { assertOjvResponseAvailable } from "./response-state";
import { classifyMovimiento } from "@/lib/pjud/classify";
import { scrapeMovimientoIdentity, type PjudFetchedMovimiento } from "@/lib/pjud/types";
import { parseLocalDateInput } from "@/lib/minutas";
import { extractRitsFromText, normalizeTribunalLabel, pickTribunalFromTexts } from "@/lib/pjud/ojv-dom";
import { DomUtils, parseDocument } from "htmlparser2";
import { PJUD_MAX_CAUSA_MOVIMIENTOS } from "@/lib/pjud/cuadernos-limits";

type HtmlNode = ReturnType<typeof parseDocument>["children"][number];

function excludedNode(node: HtmlNode): boolean {
  if (node.type === "script" || node.type === "style" || node.type === "comment") return true;
  return node.type === "tag" && (
    /^(noscript|template)$/.test(node.name) ||
    "hidden" in node.attribs ||
    node.attribs["aria-hidden"] === "true" ||
    /display\s*:\s*none|visibility\s*:\s*hidden/i.test(node.attribs.style || "") ||
    (/\btab-pane\b/.test(node.attribs.class || "") && !/\bactive\b/.test(node.attribs.class || ""))
  );
}

function visibleDocument(html: string) {
  const document = parseDocument(html);
  const clean = (node: HtmlNode) => {
    if (!("children" in node)) return;
    node.children = node.children.filter((child) => {
      if (!excludedNode(child)) return true;
      // Responsive tables may hide a cell in only the header or body. Dropping
      // it shifts every later column, including the verified date column.
      // Retain only its position; invisible text and download links are removed.
      if (child.type === "tag" && /^(td|th)$/.test(child.name)) {
        child.children = [];
        return true;
      }
      return false;
    });
    node.children.forEach(clean);
  };
  clean(document);
  return document;
}

/** The observed Civil history panel excludes the modal's separate court referrals. */
function visibleHistoryDocument(html: string): HtmlNode {
  const document = visibleDocument(html);
  const findCivilHistory = (node: HtmlNode): HtmlNode | null => {
    if (node.type === "tag" && node.attribs.id === "historiaCiv" && /\bactive\b/.test(node.attribs.class || "")) return node;
    if (!("children" in node)) return null;
    for (const child of node.children) {
      const found = findCivilHistory(child);
      if (found) return found;
    }
    return null;
  };
  return findCivilHistory(document) || document;
}

function nodeText(node: HtmlNode): string {
  if (node.type === "text") return node.data;
  if (excludedNode(node)) return "";
  return "children" in node ? node.children.map(nodeText).join(" ") : "";
}

function stripTags(s: string) {
  return nodeText(parseDocument(s)).replace(/\s+/g, " ").trim();
}

function hasTable(node: HtmlNode): boolean {
  return (node.type === "tag" && /^(table|tr)$/.test(node.name)) ||
    ("children" in node && node.children.some(hasTable));
}

/** An empty history is valid only when OJV labels a recognizable history table. */
export function hasExplicitEmptyHistory(html: string): boolean {
  assertOjvResponseAvailable(html);
  const visit = (node: HtmlNode): boolean => {
    if (!("children" in node)) return false;
    if (node.type === "tag" && node.name === "table") {
      const text = nodeText(node).replace(/\s+/g, " ");
      return /fecha|fec[.\s]*tr[aá]mite/i.test(text) && /tr[aá]mite|actuaci[oó]n|resoluci[oó]n|descripci[oó]n/i.test(text) &&
        /sin (?:movimientos|registros)|no (?:hay|existen|se (?:han encontrado|encontraron)) (?:movimientos|registros)|ning[uú]n dato disponible/i.test(text);
    }
    return node.children.some(visit);
  };
  return visit(visibleHistoryDocument(html));
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

function parseHistoryDate(raw: string, identifiedColumn: boolean): Date | null {
  let primary = raw;
  if (identifiedColumn) {
    // Civil Fec. Trámite can show a second date. Preserve it in detalle only.
    const paired = raw.match(/^(\d{1,2}\/\d{1,2}\/\d{4})\s*\(\d{1,2}\/\d{1,2}\/\d{4}\)$/);
    if (paired) primary = paired[1];
    if (/^\d{4}-\d{2}-\d{2}/.test(primary) &&
      !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(primary)) return null;
  }
  const normalized = normalizeChileanDate(primary);
  if (!normalized) return null;
  const date = parseLocalDateInput(normalized);
  if (!date) return null;
  if (identifiedColumn) {
    const [year, month, day] = normalized.split("-").map(Number);
    if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) return null;
  }
  return date;
}

function columnLabel(cell: string) {
  return cell.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[._]/g, " ").replace(/\s+/g, " ").trim();
}

function dateColumnLabel(label: string) {
  return /^(?:fecha|fec)(?: de[l]?| de la)?(?: tramite|actuacion|resolucion|ingreso|presentacion)?$/.test(label);
}

function isHeaderRow(cells: string[]) {
  const labels = cells.map(columnLabel);
  const recognized = labels.filter((label) => dateColumnLabel(label) ||
    /^(?:folio|tramite|actuacion|resolucion|etapa|descargar|doc|documento|cuaderno|anexo|foja|georref|(?:desc|descripcion)(?: del?)?(?: tramite|actuacion|resolucion)?)$/.test(label));
  return recognized.length >= 2 && (
    labels.some(dateColumnLabel) || /^(?:folio|cuaderno)$/.test(labels[0] || "")
  );
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
export function parseMovimientosFromHtml(
  html: string,
  options: { cuaderno?: string; limit?: number; onIncompleteRow?: () => void } = {}
): PjudFetchedMovimiento[] {
  assertOjvResponseAvailable(html);
  const limit = Number.isFinite(options.limit)
    ? Math.max(1, Math.min(Math.floor(options.limit!), PJUD_MAX_CAUSA_MOVIMIENTOS + 1)) : 500;
  html = DomUtils.getOuterHTML(visibleHistoryDocument(html));
  const movimientos: PjudFetchedMovimiento[] = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
  const tableStarts = [...html.matchAll(/<table\b/gi)].map(match => match.index!);
  let tableCursor = -1;
  let rowMatch: RegExpExecArray | null;
  let folioSeq = 0;
  let cuadernoColumn = -1;
  let tramiteColumn = -1;
  let descripcionColumn = -1;
  let fechaColumn = -1;
  let etapaColumn = -1;
  let folioColumn = -1;
  let tableAt = -1;

  while ((rowMatch = rowRe.exec(html)) !== null) {
    while (tableCursor + 1 < tableStarts.length && tableStarts[tableCursor + 1] < rowMatch.index) tableCursor += 1;
    const currentTable = tableStarts[tableCursor] ?? -1;
    if (currentTable !== tableAt) {
      tableAt = currentTable;
      cuadernoColumn = -1;
      tramiteColumn = -1;
      descripcionColumn = -1;
      fechaColumn = -1;
      etapaColumn = -1;
      folioColumn = -1;
    }
    const cells: string[] = [];
    let cellMatch: RegExpExecArray | null;
    cellRe.lastIndex = 0;
    while ((cellMatch = cellRe.exec(rowMatch[1])) !== null) {
      cells.push(stripTags(cellMatch[1]));
    }
    if (cells.length < 2) continue;
    if (isHeaderRow(cells)) {
      const labels = cells.map(columnLabel);
      cuadernoColumn = labels.findIndex((label) => label === "cuaderno");
      tramiteColumn = labels.findIndex((label) => /^(?:tramite|actuacion|resolucion|descripcion)$/.test(label));
      descripcionColumn = labels.findIndex((label) => /^(?:desc|descripcion)(?: del?)? (?:tramite|actuacion|resolucion)$/.test(label));
      fechaColumn = labels.findIndex(dateColumnLabel);
      etapaColumn = labels.findIndex((label) => label === "etapa");
      folioColumn = labels.findIndex((label) => label === "folio");
      continue;
    }

    const joined = cells.join(" | ");
    if (
      /tribunal|car[aá]tula|litigante|^rol\b|^rit\b/i.test(joined) &&
      cells.length <= 4 &&
      !/\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(joined)
    ) {
      continue;
    }

    const fechaRaw = fechaColumn >= 0 ? cells[fechaColumn] : cells.find((c) => cellLooksLikeDate(c));
    if (!fechaRaw) {
      if (fechaColumn >= 0) options.onIncompleteRow?.();
      continue;
    }
    const fecha = parseHistoryDate(fechaRaw, fechaColumn >= 0);
    if (!fecha) {
      if (fechaColumn >= 0) options.onIncompleteRow?.();
      continue;
    }

    const rowCuaderno = (cuadernoColumn >= 0 ? cells[cuadernoColumn] : null) ||
      cells.find((c) => /^(?:principal|apelaci[oó]n|incidente|exhorto)(?:\s+(?:n[°ºo.]?\s*)?\d+)?$/i.test(c)) || null;
    if (options.cuaderno && cuadernoColumn >= 0 && rowCuaderno) {
      const baseLabel = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/^\s*\d+(?:\.\d+)*\s*[-–—]\s*/, "").trim().replace(/\s+/g, " ").toLowerCase();
      if (baseLabel(options.cuaderno) !== baseLabel(rowCuaderno)) {
        throw new Error("El historial no corresponde al cuaderno seleccionado.");
      }
    }
    const identifiedCuaderno = options.cuaderno || rowCuaderno;
    const identifiedTitle = [descripcionColumn, tramiteColumn]
      .filter((column) => column >= 0).map((column) => cells[column])
      .find((value) => value && value.length >= 4);
    const titulo = identifiedTitle || (descripcionColumn < 0 && tramiteColumn < 0 ? cells.find(
        (c) =>
          c.length > 8 &&
          !/^\d+$/.test(c) &&
          c !== identifiedCuaderno &&
          !cellLooksLikeDate(c)
      ) || cells[cells.length - 1] : null);
    if (!titulo || titulo.length < 4) {
      options.onIncompleteRow?.();
      continue;
    }
    if (/^(folio|fecha|trámite|tramite|etapa|descargar)$/i.test(titulo)) continue;

    folioSeq += 1;
    const classified = classifyMovimiento(titulo, joined);
    const esReceptor =
      classified.tipo === "notificacion" ||
      /receptor|c[eé]dula|notificaci[oó]n/i.test(titulo);
    const pendienteResolucion = Boolean(classified.pendienteResolucion);
    const cuaderno = identifiedCuaderno;
    const folioValue = cells[folioColumn >= 0 ? folioColumn : 0];
    const folioCandidate = /^\d{1,5}$/.test(folioValue || "") ? folioValue : null;
    const folio = folioCandidate || String(folioSeq);
    const documentoRef = extractDocumentoHrefFromRowHtml(rowMatch[1]);

    movimientos.push({
      ...scrapeMovimientoIdentity(titulo, fecha, folio, identifiedCuaderno),
      titulo,
      detalle: joined.slice(0, 4000),
      fecha,
      referencia: folio,
      tipo: classified.tipo,
      relevante: classified.relevante || esReceptor || pendienteResolucion,
      fuente: "pjud",
      cuaderno,
      folio,
      etapa: (etapaColumn >= 0 ? cells[etapaColumn] : null) ||
        cells.find((c) => /etapa|ingreso|traslado|audiencia/i.test(c)) || null,
      tramite: (tramiteColumn >= 0 ? cells[tramiteColumn] : null) ||
        cells.find((c) =>
          /prove[ií]do|resoluci[oó]n|escrito|c[eé]dula/i.test(c)
        ) || null,
      esReceptor,
      pendienteResolucion,
      documentoRef,
    });
    if (movimientos.length >= limit) break;
  }

  return movimientos;
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
  html = DomUtils.getOuterHTML(visibleDocument(html));
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
    const rits = extractRitsFromText(joined);
    if (rits.length !== 1) continue;
    const rit = rits[0];
    const tribunal =
      pickTribunalFromTexts(cells) || "Tribunal no identificado";
    if (/sin tribunal/i.test(tribunal)) continue;
    const key = `${rit}|${tribunal}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      rit,
      tribunal,
      caratula: cells.find((c) => !cellLooksLikeDate(c) && /\bvs\.?\b|\/|con\b/i.test(c)) || cells[0],
      ruc: cells.find((c) => /\d{1,3}-\d{8,}-\d/.test(c)) || null,
      estado: cells.find((c) => /tramitaci|terminad|archiv/i.test(c)) || null,
    });
  }
  return items;
}

/**
 * Fallback cuando Mis Causas no usa `<table>` clásica (cards / divs).
 * Cada card debe contener una sola causa. Nunca asociar un tribunal de otra card.
 */
export function parseMisCausasLooseFromHtml(html: string): Array<{
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
  const cards: HtmlNode[] = [];
  const visit = (node: HtmlNode, inTable = false) => {
    if (!("children" in node)) return;
    const table = inTable || (node.type === "tag" && /^(table|tr|td|th)$/.test(node.name));
    if (!table && node.type === "tag" && /(?:^|\s)(?:card|list-group-item|panel|causa)(?:\s|$)/.test(node.attribs.class || "")) {
      const rits = extractRitsFromText(nodeText(node));
      if (rits.length === 1 && !hasTable(node)) {
        cards.push(node);
        return;
      }
    }
    node.children.forEach((child) => visit(child, table));
  };
  visit(visibleDocument(html));
  for (const card of cards) {
    const text = nodeText(card).replace(/\s+/g, " ").trim();
    const rit = extractRitsFromText(text)[0];
    const parts = "children" in card
      ? card.children.flatMap((child) => nodeText(child).split(/[|·]/)).map((s) => s.trim()).filter(Boolean)
      : [];
    const tribunal = pickTribunalFromTexts(parts) || "Tribunal no identificado";
    const key = `${rit}|${tribunal}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const rucMatch = text.match(/\b(\d{1,3}-\d{8,}-\d)\b/i);
    const estadoMatch = text.match(
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
      const key = `${item.rit.toUpperCase()}|${normalizeTribunalLabel(item.tribunal)}`;
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
  assertOjvResponseAvailable(html);
  html = DomUtils.getOuterHTML(visibleDocument(html));
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
    const rits = extractRitsFromText(joined);
    if (rits.length !== 1) continue;
    const rit = rits[0];
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
        dataCells.find((c) => !cellLooksLikeDate(c) && /\bvs\.?\b|\/|con\b/i.test(c)) ||
        dataCells.find((c) => c.length > 8 && c !== rit && c !== tribunal && !cellLooksLikeDate(c)) ||
        null,
      ruc: dataCells.find((c) => /\d{1,3}-\d{8,}-\d/.test(c)) || null,
      estado:
        dataCells.find((c) => /tramitaci|terminad|archiv|vigente|activ/i.test(c)) ||
        null,
      fecha: fechaNorm,
      fechaDate: fechaNorm ? parseLocalDateInput(fechaNorm) : null,
    });
  }
  return out;
}
