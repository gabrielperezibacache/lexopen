import { request } from "node:https";
import { lookup } from "node:dns";
import { isIP, type LookupFunction } from "node:net";
import { Readable } from "node:stream";
import { Parser, parseDocument } from "htmlparser2";
import { isPrivateOrLocalHostname, isSafeOutboundHttpUrl } from "@/lib/net/safe-url";
import type { FetchedLegalSource, PublicSourceFetchOptions } from "./source-types";

type AnyNode = ReturnType<typeof parseDocument>["children"][number];
type Element = Extract<AnyNode, { attribs: Record<string, string> }>;

export const PUBLIC_SOURCE_MAX_BYTES = 8 * 1024 * 1024;
export const PUBLIC_SOURCE_TIMEOUT_MS = 20_000;
const MAX_SOURCE_TEXT = 2_000_000;
const DT_BODY = "article_i__w3_ar_ArticuloCompleto_cuerpo_1";
const DT_HEADER = "article_i__w3_ar_ArticuloCompleto_presentacion_1";
const VERSION_WARNING = "La fecha de consulta y la fecha del documento no acreditan su vigencia. Revise modificaciones y pronunciamientos posteriores.";

function sourceError(message: string, status = 502, code = "public_source_unavailable") {
  return Object.assign(new Error(message), { status, code });
}
function validDate(value: string | undefined): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : undefined;
}

type Location = { provider: "dt" | "bcn"; canonicalUrl: string; retrievalUrl: string; externalId: string; version?: string };
function sourceLocation(raw: string): Location {
  if (raw.length > 2000 || !isSafeOutboundHttpUrl(raw, { allowHttp: false })) {
    throw sourceError("Use una URL HTTPS de una fuente oficial admitida", 400, "unsupported_source_url");
  }
  const url = new URL(raw);
  if (url.port && url.port !== "443") throw sourceError("Puerto de fuente no admitido", 400, "unsupported_source_url");
  const host = url.hostname.toLowerCase();
  if (["www.dt.gob.cl", "dt.gob.cl"].includes(host)) {
    const id = /^\/legislacion\/1624\/w3-article-(\d{1,10})\.html$/.exec(url.pathname)?.[1];
    if (!id || url.search) throw sourceError("Importe el enlace individual de un dictamen de la Dirección del Trabajo", 400, "unsupported_source_url");
    const canonicalUrl = `https://www.dt.gob.cl/legislacion/1624/w3-article-${id}.html`;
    return { provider: "dt", canonicalUrl, retrievalUrl: canonicalUrl, externalId: `DT:${id}` };
  }
  if (["www.bcn.cl", "bcn.cl", "www.leychile.cl", "leychile.cl"].includes(host)) {
    if (!/^\/(?:leychile\/)?(?:navegar|consulta\/obtxml)$/i.test(url.pathname)) throw sourceError("Use el enlace de una norma individual de LeyChile", 400, "unsupported_source_url");
    const id = url.searchParams.get("idNorma");
    const version = url.searchParams.get("idVersion") || undefined;
    const allowed = new Set(["idNorma", "idVersion", "opt"]);
    if (!id || !/^\d{1,10}$/.test(id) || [...url.searchParams.keys()].some(k => !allowed.has(k)) || [...url.searchParams.keys()].some(k => url.searchParams.getAll(k).length !== 1) || (version && !validDate(version))) {
      throw sourceError("LeyChile requiere idNorma y, opcionalmente, idVersion con fecha válida", 400, "unsupported_source_url");
    }
    const query = new URLSearchParams({ idNorma: id, ...(version ? { idVersion: version } : {}) });
    return { provider: "bcn", canonicalUrl: `https://www.bcn.cl/leychile/navegar?${query}`, retrievalUrl: `https://www.bcn.cl/leychile/consulta/obtxml?opt=7&${query}`, externalId: `BCN:${id}`, version };
  }
  throw sourceError("Fuente no admitida. Use una norma de LeyChile o un dictamen individual de la Dirección del Trabajo", 400, "unsupported_source_url");
}

/** Closed allowlist also applies to an explicitly identified manual import. */
export function validatePublicLegalSourceUrl(raw: string): string { return sourceLocation(raw).canonicalUrl; }

export function isPublicSourceAddress(address: string): boolean {
  const family = isIP(address);
  if (!family || isPrivateOrLocalHostname(address)) return false;
  if (family === 4) {
    const [a, b, c] = address.split(".").map(Number);
    if (a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || (a === 198 && [18, 19].includes(b)) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113)) return false;
  } else if (!/^[23][0-9a-f]{3}:/i.test(address) || /^2001:db8(?::|$)/i.test(address)) return false;
  return true;
}

/** Resolve and validate at connection time, so a second DNS lookup cannot rebind. */
const publicLookup: LookupFunction = (hostname, options, callback) => {
  lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
    if (error) { callback(error, "", 4); return; }
    if (!addresses.length || addresses.some(row => !isPublicSourceAddress(row.address))) {
      callback(Object.assign(new Error("La fuente resolvió una dirección no pública"), { code: "EACCES" }), "", 4); return;
    }
    if (options.all) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  });
};

async function officialRequest(url: string, init: RequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: "GET", signal: init.signal || undefined, lookup: publicLookup,
      headers: { Accept: "application/xml, text/xml, text/html;q=0.9", "Accept-Encoding": "identity", "User-Agent": "LexOpen/1.0 (public legal source importer)" } }, response => {
      // node:https never follows a Location header; the caller rejects 3xx.
      try {
        const headers = new Headers();
        for (const [key, value] of Object.entries(response.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
        const status = response.statusCode || 502;
        const body = [204, 205, 304].includes(status) ? null : Readable.toWeb(response) as ReadableStream<Uint8Array>;
        if (!body) response.resume();
        resolve(new Response(body, { status, headers }));
      } catch (error) { response.destroy(); reject(error); }
    });
    req.once("error", reject);
    req.end();
  });
}

async function readBounded(response: Response, signal: AbortSignal, limit: number) {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > limit) { await response.body?.cancel(); throw sourceError("La fuente supera el tamaño de importación permitido", 413, "public_source_too_large"); }
  if (!response.body) throw sourceError("La fuente no devolvió contenido");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let onAbort: (() => void) | undefined;
  const abort = new Promise<never>((_, reject) => {
    onAbort = () => { reject(sourceError("La consulta a la fuente fue cancelada o agotó su tiempo", 503, "public_source_timeout")); void reader.cancel().catch(() => undefined); };
    if (signal.aborted) onAbort(); else signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    for (;;) {
      const next = await Promise.race([reader.read(), abort]);
      if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) { await reader.cancel(); throw sourceError("La fuente supera el tamaño de importación permitido", 413, "public_source_too_large"); }
      chunks.push(next.value);
    }
    return Buffer.concat(chunks, size);
  } finally { if (onAbort) signal.removeEventListener("abort", onAbort); reader.releaseLock(); }
}

function decode(bytes: Buffer, mime: string) {
  const declaration = bytes.subarray(0, 200).toString("ascii");
  const encoding = /charset\s*=\s*["']?([\w-]+)/i.exec(mime)?.[1] || /encoding\s*=\s*["']([\w-]+)/i.exec(declaration)?.[1] || "utf-8";
  if (!/^(?:utf-8|utf8|iso-8859-1|windows-1252)$/i.test(encoding)) throw sourceError("Codificación de la fuente no admitida");
  return new TextDecoder(encoding, { fatal: true }).decode(bytes);
}
function element(node: AnyNode): node is Element { return "name" in node && "attribs" in node; }
function descendants(node: AnyNode): AnyNode[] { return "children" in node ? node.children : []; }
function find(node: AnyNode, predicate: (node: Element) => boolean): Element | undefined {
  if (element(node) && predicate(node)) return node;
  for (const child of descendants(node)) { const match = find(child, predicate); if (match) return match; }
}
const BLOCK_TAGS = new Set(["p", "div", "li", "h1", "h2", "h3", "h4", "tr", "br", "Texto", "Articulo", "EstructuraFuncional"]);
function literalText(node: AnyNode): string {
  if (node.type === "text") return node.data;
  if (element(node) && (["script", "style", "noscript", "form", "button", "nav", "ArchivosBinarios", "Imagen"].includes(node.name) || node.attribs.hidden !== undefined || /display\s*:\s*none/i.test(node.attribs.style || ""))) return "";
  const text = descendants(node).map(literalText).join("");
  return element(node) && BLOCK_TAGS.has(node.name) ? `\n${text}\n` : text;
}
function cleanText(value: string) { return value.replace(/\r\n?/g, "\n").replace(/[\t\f ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim(); }

/** The HTML parser is forgiving; reject XML closures it would otherwise invent. */
function assertClosedXml(raw: string) {
  const opened: { name: string; selfClosing: boolean }[] = [];
  let invalid = false;
  const parser = new Parser({
    onopentag(name) { opened.push({ name, selfClosing: /\/\s*>$/.test(raw.slice(parser.startIndex, parser.endIndex + 1)) }); },
    onclosetag(name, implied) {
      const opening = opened.pop();
      if (!opening || opening.name !== name || (implied && !opening.selfClosing)) invalid = true;
    },
  }, { xmlMode: true });
  parser.end(raw);
  if (invalid || opened.length) throw sourceError("El XML de la fuente está truncado o tiene cierres incompatibles", 502, "public_source_format");
}

function parseDt(raw: string, location: Location): Omit<FetchedLegalSource, "rawBytes" | "mimeType" | "retrievedAt" | "retrievalUrl" | "canonicalUrl"> {
  const document = parseDocument(raw);
  const body = find(document, node => node.attribs.id === DT_BODY);
  const header = find(document, node => node.attribs.id === DT_HEADER);
  const title = header && find(header, node => /^h[1-6]$/.test(node.name) && (node.attribs.class || "").split(/\s+/).includes("titulo"));
  const dateNode = header && find(header, node => (node.attribs.class || "").split(/\s+/).includes("fecha"));
  const dateDigits = dateNode && /\biso8601-(\d{4})(\d{2})(\d{2})T/.exec(dateNode.attribs.class || "");
  if (!body || !title) throw sourceError("La página oficial no contiene un dictamen reconocible. Puede haberse modificado su formato", 502, "public_source_format");
  const text = cleanText(literalText(body));
  const titleText = cleanText(literalText(title));
  if (text.length < 80 || !/^ORD\.?\s*(?:N[°º.]|\d)/iu.test(titleText)) throw sourceError("La fuente no contiene el texto íntegro reconocible de un pronunciamiento", 502, "public_source_format");
  return { title: titleText, organism: "Dirección del Trabajo", kind: "administrative", externalId: location.externalId,
    publishedAt: dateDigits ? validDate(`${dateDigits[1]}-${dateDigits[2]}-${dateDigits[3]}`) : undefined, text,
    coverageWarnings: [VERSION_WARNING, "Importación de un pronunciamiento individual; no acredita cobertura completa de la Dirección del Trabajo.", "La fecha de cabecera corresponde al documento publicado; no se deduce una fecha de inicio o término de efectos."] };
}

function parseBcn(raw: string, location: Location): Omit<FetchedLegalSource, "rawBytes" | "mimeType" | "retrievedAt" | "retrievalUrl" | "canonicalUrl"> {
  if (/<!DOCTYPE|<!ENTITY/i.test(raw)) throw sourceError("El XML de la fuente contiene declaraciones no admitidas", 502, "public_source_format");
  assertClosedXml(raw);
  const document = parseDocument(raw, { xmlMode: true, decodeEntities: true });
  const local = (node: Element) => node.name.split(":").at(-1);
  const norma = find(document, node => local(node) === "Norma");
  const expectedId = location.externalId.split(":")[1];
  const roots = document.children.filter(element);
  if (!norma || roots.length !== 1 || roots[0] !== norma || norma.attribs.normaId !== expectedId) throw sourceError("El XML no identifica la norma solicitada", 502, "public_source_format");
  const titleNode = find(norma, node => local(node) === "TituloNorma");
  const identifier = find(norma, node => local(node) === "Identificador");
  const parts = descendants(norma).filter(node => element(node) && ["Encabezado", "EstructurasFuncionales", "Promulgacion", "Anexos"].includes(local(node) || ""));
  if (!parts.length || !titleNode) throw sourceError("La norma no contiene estructura y título reconocibles", 502, "public_source_format");
  const texts: string[] = [];
  function collect(node: AnyNode) {
    if (element(node) && ["ArchivosBinarios", "Imagen"].includes(local(node) || "")) return;
    if (element(node) && local(node) === "Texto") { texts.push(cleanText(literalText(node))); return; }
    for (const child of descendants(node)) collect(child);
  }
  parts.forEach(collect);
  const text = texts.filter(Boolean).join("\n\n");
  if (text.length < 40) throw sourceError("El XML no contiene texto suficiente para investigar", 502, "public_source_format");
  const warnings = [VERSION_WARNING, "Importación de una norma individual. Las imágenes, adjuntos y notas binarias requieren revisión en el original.", "Las fechas de versión de LeyChile no se convierten automáticamente en fechas de vigencia comprobada."];
  if (norma.attribs.derogado === "derogado") warnings.push("La fuente identifica esta norma como derogada.");
  if (location.version && norma.attribs.fechaVersion !== location.version) throw sourceError("La fuente no confirmó la versión histórica solicitada", 409, "public_source_version_mismatch");
  return { title: cleanText(literalText(titleNode)), organism: "Biblioteca del Congreso Nacional de Chile", kind: "legislation", externalId: location.externalId,
    publishedAt: validDate(identifier?.attribs.fechaPublicacion), text, coverageWarnings: warnings };
}

/** One explicit public URL only; no user/case text, cookies, credentials or model calls. */
export async function fetchPublicLegalSource(rawUrl: string, options: PublicSourceFetchOptions = {}): Promise<FetchedLegalSource> {
  const location = sourceLocation(rawUrl);
  const timeoutMs = Math.min(PUBLIC_SOURCE_TIMEOUT_MS, Math.max(1, options.timeoutMs || PUBLIC_SOURCE_TIMEOUT_MS));
  const maxBytes = Math.min(PUBLIC_SOURCE_MAX_BYTES, Math.max(1, options.maxBytes || PUBLIC_SOURCE_MAX_BYTES));
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
  if (signal.aborted) throw sourceError("La consulta a la fuente fue cancelada", 503, "public_source_timeout");
  const transport = options.fetch || officialRequest;
  let response: Response;
  try {
    response = await transport(location.retrievalUrl, { method: "GET", redirect: "error", credentials: "omit", cache: "no-store", signal, headers: { Accept: "application/xml, text/xml, text/html;q=0.9" } });
  } catch { throw sourceError(signal.aborted ? "La consulta a la fuente fue cancelada o agotó su tiempo" : "No fue posible consultar la fuente oficial; puede importar una copia identificada manualmente", 503); }
  if (!response.ok || response.redirected) {
    await response.body?.cancel();
    throw sourceError(`La fuente oficial no está disponible (HTTP ${response.status}). Puede conservar una copia identificada mediante importación manual`, 503);
  }
  const mime = response.headers.get("content-type") || "";
  if (location.provider === "dt" ? !/^text\/html\b/i.test(mime) : !/^(?:text|application)\/xml\b/i.test(mime)) {
    await response.body?.cancel(); throw sourceError("La fuente devolvió un formato distinto del documento esperado", 502, "public_source_format");
  }
  let rawBytes: Buffer;
  try { rawBytes = await readBounded(response, signal, maxBytes); }
  catch (error) { if (error && typeof error === "object" && "status" in error) throw error; throw sourceError("Se interrumpió la descarga de la fuente oficial. Reintente la consulta", 503); }
  let parsed: ReturnType<typeof parseDt>;
  try { parsed = location.provider === "dt" ? parseDt(decode(rawBytes, mime), location) : parseBcn(decode(rawBytes, mime), location); }
  catch (error) { if (error && typeof error === "object" && "status" in error) throw error; throw sourceError("No fue posible interpretar el documento oficial", 502, "public_source_format"); }
  if (parsed.text.length > MAX_SOURCE_TEXT) throw sourceError("El texto de la fuente supera el límite de preparación", 413, "public_source_too_large");
  return { ...parsed, canonicalUrl: location.canonicalUrl, retrievalUrl: location.retrievalUrl, mimeType: mime.split(";")[0].trim().toLowerCase(), rawBytes, retrievedAt: new Date() };
}
