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
  if (node.type !== "tag") return false;
  const classes = node.attribs.class || "";
  return (
    /^(noscript|template)$/.test(node.name) ||
    "hidden" in node.attribs ||
    node.attribs["aria-hidden"] === "true" ||
    /display\s*:\s*none|visibility\s*:\s*hidden/i.test(node.attribs.style || "") ||
    (/\btab-pane\b/.test(classes) && !/\bactive\b/.test(classes)) ||
    (/\b(?:panel-collapse|collapse)\b/.test(classes) && !/\b(?:in|show)\b/.test(classes))
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
    .replace(/[._/]/g, " ").replace(/\s+/g, " ").trim();
}

function dateColumnLabel(label: string) {
  return /^(?:fecha|fec)(?: de[l]?| de la)?(?: tramite|actuacion|resolucion|ingreso|presentacion)?$/.test(label);
}

type CauseColumns = {
  rit: number;
  tribunal: number;
  caratula: number;
  fecha: number;
  estado: number;
  ruc: number;
  libro: number;
  numero: number;
  era: number;
};

function findTagNodes(node: HtmlNode, tagName: string): HtmlNode[] {
  const found: HtmlNode[] = [];
  const visit = (current: HtmlNode) => {
    if (current.type === "tag" && current.name === tagName) found.push(current);
    if ("children" in current) current.children.forEach(visit);
  };
  visit(node);
  return found;
}

function causeTableRows(html: string, tableId?: RegExp): HtmlNode[][] {
  const document = visibleDocument(html);
  let tables = findTagNodes(document, "table").filter((node) => node.type === "tag");
  if (tableId) {
    const matching = tables.filter((table) => table.type === "tag" && tableId.test(table.attribs.id || ""));
    if (matching.length) tables = matching;
  }
  if (!tables.length) return [findTagNodes(document, "tr")];
  return tables.map((table) => findTagNodes(table, "tr"));
}

function causeRowCells(row: HtmlNode) {
  if (!("children" in row)) return [];
  return row.children.filter((cell): cell is HtmlNode =>
    cell.type === "tag" && /^(?:td|th)$/.test(cell.name)
  );
}

function causeColumnMap(labels: string[]): CauseColumns | null {
  const normalized = labels.map(columnLabel);
  const rit = normalized.findIndex((label) => /^(?:rit|rol|rol rit|nro rol|numero rol|nro rit|numero rit)$/.test(label));
  const tribunal = normalized.findIndex((label) => /^(?:tribunal|corte|tribunal corte|corte tribunal)$/.test(label));
  const caratula = normalized.findIndex((label) => /^(?:caratulado|caratula|caratula causa)$/.test(label));
  if (rit < 0 || (tribunal < 0 && caratula < 0)) return null;
  return {
    rit,
    tribunal,
    caratula,
    fecha: normalized.findIndex(dateColumnLabel),
    estado: normalized.findIndex((label) => /^(?:estado|estado causa|estado de causa|estado procesal)$/.test(label)),
    ruc: normalized.findIndex((label) => label === "ruc"),
    libro: normalized.findIndex((label) => /^(?:libro|tipo libro|tipo recurso)$/.test(label)),
    numero: normalized.findIndex((label) => /^(?:nro|numero|nro causa|numero causa|nro rol|numero rol)$/.test(label)),
    era: normalized.findIndex((label) => /^(?:ano|era|periodo|year)$/.test(label)),
  };
}

function mappedRit(cells: string[], headers: CauseColumns | null) {
  const direct = headers && headers.rit >= 0 ? extractRitsFromText(cells[headers.rit] || "") : [];
  if (direct.length === 1) return direct;
  if (!headers || headers.libro < 0) return direct;
  const book = cells[headers.libro]?.trim();
  const number = headers.numero >= 0 ? cells[headers.numero]?.trim() : headers.rit >= 0 ? cells[headers.rit]?.trim() : "";
  const year = headers.era >= 0 ? cells[headers.era]?.trim() : "";
  if (!book || !number || !year || !/^\d{1,6}$/.test(number) || !/^\d{4}$/.test(year)) return direct;
  const composite = extractRitsFromText(`${book}-${number}-${year}`);
  return composite.length === 1 ? composite : direct;
}

function fallbackCaratula(cells: string[], rit: string, tribunal: string) {
  const candidate = (value: string) => {
    const cleaned = value.trim();
    return Boolean(cleaned && cleaned !== rit && cleaned !== tribunal &&
      !cellLooksLikeDate(cleaned) && !/\d{1,3}-\d{8,}-\d/.test(cleaned) &&
      !/^\([^)]+\)/.test(cleaned) &&
      !/^(?:corte suprema|corte de apelaciones|\d+[º°o]?\s*juzgado|juzgado\b|tribunal\b)/i.test(cleaned));
  };
  return cells.find((cell) => candidate(cell) && /\bcontra\b|\bvs\.?\b|\bcon\b|\//i.test(cell)) ||
    cells.find((cell) => candidate(cell) && cell.length > 8) || null;
}

function isHeaderRow(cells: string[]) {
  const labels = cells.map(columnLabel);
  const recognized = labels.filter((label) => dateColumnLabel(label) ||
    /^(?:folio|tramite|actuacion|resolucion|descripcion|etapa|descargar|doc|documento|cuaderno|anexo|foja|georref|(?:des|desc|descripcion)(?: del?)?(?: tramite|actuacion|resolucion)?)$/.test(label));
  return recognized.length >= 2 && (
    labels.some(dateColumnLabel) || /^(?:folio|cuaderno)$/.test(labels[0] || "")
  );
}

function resolveDocumentoUrl(href: string): string | null {
    const value = href.trim();
    if (!value || value.startsWith("#") || /^javascript:/i.test(value)) return null;
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith("//")) return `https:${value}`;
    if (value.startsWith("/")) {
      return `https://oficinajudicialvirtual.pjud.cl${value}`;
    }
    // Relative paths from OJV modal / includes
    const cleaned = value.replace(/^\.\//, "").replace(/^(\.\.\/)+/, "");
    return `https://oficinajudicialvirtual.pjud.cl/${cleaned}`;
}

function looksLikeDocumentAction(href: string, text = "") {
  return (
    /\.(pdf|doc|docx)(\?|$)/i.test(href) ||
    /\bdoc(?:u|umento|cau|reformado)|descarg|archivo|anexo|escrito|ebook|pdf|folio/i.test(href) ||
    /descarg|pdf|documento|ver\s*doc|anexo|escrito/i.test(text)
  );
}

type DocumentoForm = { action: string; method: "GET" | "POST"; fields: Array<[string, string]> };

function documentoFormsFromRow(rowHtml: string): DocumentoForm[] {
  const document = parseDocument(rowHtml);
  return findTagNodes(document, "form").flatMap((node) => {
    if (node.type !== "tag") return [];
    const action = resolveDocumentoUrl(node.attribs.action || "");
    const method = (node.attribs.method || "get").toUpperCase();
    if (!action || (method !== "GET" && method !== "POST") || !looksLikeDocumentAction(action)) return [];
    const fields = findTagNodes(node, "input").flatMap((input) => {
      if (input.type !== "tag" || !input.attribs.name || (input.attribs.type || "text").toLowerCase() !== "hidden") return [];
      return [[input.attribs.name, input.attribs.value || ""] as [string, string]];
    });
    return [{ action, method: method as "GET" | "POST", fields }];
  }).sort((left, right) => Number(/doccertificado/i.test(left.action)) - Number(/doccertificado/i.test(right.action)));
}

function getFormUrl(form: DocumentoForm): string {
  const url = new URL(form.action);
  for (const [name, value] of form.fields) url.searchParams.append(name, value);
  return url.toString();
}

/** POST form data is transient: it is used only while the authenticated page is open. */
export function extractDocumentoPostFromRowHtml(rowHtml: string): { action: string; fields: Array<[string, string]> } | null {
  const form = documentoFormsFromRow(rowHtml).find((candidate) => candidate.method === "POST");
  return form ? { action: form.action, fields: form.fields } : null;
}

/** True only for known OJV attachment-modal actions, never arbitrary onclick scripts. */
export function hasRecognizedDocumentoAnnexAction(rowHtml: string): boolean {
  const document = parseDocument(rowHtml);
  const allowed = /\b(?:anexoSolicitudCivil|escritoSuprema|verDocTramiteSupremaPdf|anexoEscritoApelaciones|anexoEscritoLaboral|anexoEscritoCobranza|anexoEscritoPenal|documentosCobranza|anexoEscritoSuprema)\s*\(/i;
  return findTagNodes(document, "a").some((node) => node.type === "tag" && (
    allowed.test(node.attribs.onclick || "") ||
    /^#modal[^#]*(?:anexo|escrito|doc)/i.test(node.attribs.href || "")
  ));
}

/** Return only a whitelisted function name or a fragment-only target for a known attachment modal. */
export function extractDocumentoAnnexActionFromRowHtml(rowHtml: string): string | null {
  const document = parseDocument(rowHtml);
  const allowed = /\b(?:anexoSolicitudCivil|escritoSuprema|verDocTramiteSupremaPdf|anexoEscritoApelaciones|anexoEscritoLaboral|anexoEscritoCobranza|anexoEscritoPenal|documentosCobranza|anexoEscritoSuprema)\s*\(/i;
  for (const node of findTagNodes(document, "a")) {
    if (node.type !== "tag") continue;
    const onclick = node.attribs.onclick || "";
    const action = onclick.match(allowed)?.[0]?.replace(/\s*\($/, "") || "";
    if (action) return action;
    const href = node.attribs.href || "";
    if (/^#modal[^#]*(?:anexo|escrito|doc)/i.test(href)) return href;
  }
  return null;
}

/** Absolute OJV download URL from a row form or direct anchor. */
export function extractDocumentoHrefFromRowHtml(rowHtml: string): string | null {
  const forms = documentoFormsFromRow(rowHtml);
  const getForm = forms.find((form) => form.method === "GET");
  if (getForm) return getFormUrl(getForm);

  const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorRe.exec(rowHtml)) !== null) {
    const attrs = match[1] || "";
    const text = stripTags(match[2] || "").toLowerCase();
    const hrefMatch = attrs.match(/href\s*=\s*["']([^"']+)["']/i);
    const href = hrefMatch?.[1]?.trim() || "";
    if (href && looksLikeDocumentAction(href, text)) {
      const resolved = resolveDocumentoUrl(href);
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
      if (fromJs?.[1] && looksLikeDocumentAction(fromJs[1], text || "documento")) {
        const resolved = resolveDocumentoUrl(fromJs[1]);
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
      descripcionColumn = labels.findIndex((label) => /^(?:des|desc|descripcion)(?: del?)?(?: (?:tramite|actuacion|resolucion))?$/.test(label));
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
    const documentoPost = extractDocumentoPostFromRowHtml(rowMatch[1]);
    const documentoAnexoAction = !documentoRef && !documentoPost ? extractDocumentoAnnexActionFromRowHtml(rowMatch[1]) : null;
    const documentoAnexo = Boolean(documentoAnexoAction);

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
      documentoPost,
      documentoAnexo,
      documentoAnexoAction,
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
  fecha?: string | null;
  ruc?: string | null;
  estado?: string | null;
}> {
  const items: Array<{
    rit: string;
    tribunal: string;
    caratula?: string | null;
    fecha?: string | null;
    ruc?: string | null;
    estado?: string | null;
  }> = [];
  const seen = new Set<string>();
  for (const rows of causeTableRows(html)) {
    let headers: CauseColumns | null = null;
    for (const row of rows) {
      const cellNodes = causeRowCells(row);
      const cells = cellNodes.map((cell) => nodeText(cell).replace(/\s+/g, " ").trim());
      if (cells.length < 2) continue;
      const mapped = causeColumnMap(cells);
      if (mapped) { headers = mapped; continue; }
      if (cellNodes.some((cell) => cell.type === "tag" && cell.name === "th") || isHeaderRow(cells)) continue;
      const joined = cells.join(" ");
      const rits = headers ? mappedRit(cells, headers) : extractRitsFromText(joined);
      if (rits.length !== 1) continue;
      const rit = rits[0];
      const tribunalText = headers && headers.tribunal >= 0 ? cells[headers.tribunal] || "" : null;
      const tribunal = headers && headers.tribunal >= 0
        ? pickTribunalFromTexts([tribunalText || ""]) || "Tribunal no identificado"
        : pickTribunalFromTexts(cells) || "Tribunal no identificado";
      if (/sin tribunal/i.test(tribunal)) continue;
      const key = `${rit}|${tribunal}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const caratula = headers && headers.caratula >= 0
        ? cells[headers.caratula] || null
        : fallbackCaratula(cells, rit, tribunal);
      const fechaText = headers && headers.fecha >= 0 ? cells[headers.fecha] || "" : cells.find(cellLooksLikeDate) || "";
      const fecha = fechaText ? normalizeChileanDate(fechaText) : null;
      items.push({
        rit,
        tribunal,
        caratula,
        fecha,
        ruc: headers && headers.ruc >= 0 ? cells[headers.ruc] || null : cells.find((c) => /\d{1,3}-\d{8,}-\d/.test(c)) || null,
        estado: headers && headers.estado >= 0 ? cells[headers.estado] || null : cells.find((c) => /tramitaci|terminad|archiv/i.test(c)) || null,
      });
    }
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
  fecha?: string | null;
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
        fecha: item.fecha ?? null,
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
  const out: VerDetalleRow[] = [];
  const seen = new Set<string>();
  for (const rows of causeTableRows(html, /^(?:verDetalleJuridica|dtaTableDetalle.*)$/i)) {
    let headers: CauseColumns | null = null;
    for (const row of rows) {
      const cellNodes = causeRowCells(row);
      const cells = cellNodes.map((cell) => nodeText(cell).replace(/\s+/g, " ").trim());
      if (cells.length < 2) continue;
      if (/pagination|<nav/i.test(nodeText(row))) continue;
      const mapped = causeColumnMap(cells);
      if (mapped) { headers = mapped; continue; }
      if (cellNodes.some((cell) => cell.type === "tag" && cell.name === "th")) continue;
      const dataCells = headers ? cells :
        (cells[0].length <= 2 || /ver|detalle|^\s*$/i.test(cells[0]) ? cells.slice(1) : cells);
      const rits = headers ? mappedRit(cells, headers) : extractRitsFromText(dataCells.join(" "));
      if (rits.length !== 1) continue;
      const rit = rits[0];
      const tribunalText = headers && headers.tribunal >= 0 ? cells[headers.tribunal] || "" : null;
      const tribunal = headers && headers.tribunal >= 0
        ? pickTribunalFromTexts([tribunalText || ""]) || "Tribunal no identificado"
        : pickTribunalFromTexts(dataCells) || "Tribunal no identificado";
      const key = `${rit}|${tribunal}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const caratula = headers && headers.caratula >= 0
        ? cells[headers.caratula] || null
        : fallbackCaratula(dataCells, rit, tribunal);
      const fechaRaw = headers && headers.fecha >= 0
        ? cells[headers.fecha] || null
        : dataCells.find((c) => cellLooksLikeDate(c)) || null;
      const fechaNorm = fechaRaw ? normalizeChileanDate(fechaRaw) : null;
      out.push({
        rit,
        tribunal,
        caratula,
        ruc: headers && headers.ruc >= 0 ? cells[headers.ruc] || null : dataCells.find((c) => /\d{1,3}-\d{8,}-\d/.test(c)) || null,
        estado: headers && headers.estado >= 0 ? cells[headers.estado] || null : dataCells.find((c) => /tramitaci|terminad|archiv|vigente|activ/i.test(c)) || null,
        fecha: fechaNorm,
        fechaDate: fechaNorm ? parseLocalDateInput(fechaNorm) : null,
      });
    }
  }
  return out;
}
