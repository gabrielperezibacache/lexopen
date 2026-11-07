import { createHash } from "node:crypto";
import { DomUtils, parseDocument, Parser } from "htmlparser2";
import { httpError } from "@/lib/auth/access";
import { isValidYmd } from "@/lib/chile-time";
import { CALL_SOURCES, type CallSource } from "./call-source-catalog";

export { CALL_SOURCES, type CallSource } from "./call-source-catalog";
export type CallFeedItem = {
  id: string;
  title: string;
  url: string;
  summary: string;
  publishedAt?: string;
  deadline?: string;
};

const MAX_BYTES = 512 * 1024;
const MAX_ITEMS = 40;
const activeSources = new Set<string>();
const plainBlockTags = new Set(["br", "div", "li", "p", "td", "tr"]);
const hiddenTags = new Set(["iframe", "noscript", "script", "style", "template"]);
const englishMonths = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
type FetchOptions = { fetch?: typeof fetch; signal?: AbortSignal };
type FeedElement = Extract<ReturnType<typeof parseDocument>["children"][number], { name: string; children: unknown[] }>;

function plainText(value: string, limit: number) {
  const parts: string[] = [];
  let hiddenDepth = 0;
  const parser = new Parser({
    onopentag(name) {
      if (hiddenDepth || hiddenTags.has(name)) hiddenDepth++;
      else if (plainBlockTags.has(name)) parts.push(" ");
    },
    onclosetag(name) {
      if (hiddenDepth) hiddenDepth--;
      else if (plainBlockTags.has(name)) parts.push(" ");
    },
    ontext(text) { if (!hiddenDepth) parts.push(text); },
  });
  parser.end(value);
  return parts.join("").replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

function localName(element: FeedElement) {
  return element.name.split(":").pop();
}

function field(element: FeedElement, ...names: string[]) {
  const children = element.children.filter(DomUtils.isTag);
  for (const name of names) {
    const node = children.find(child => localName(child) === name);
    if (node) return node.children.map(child => DomUtils.isTag(child)
      ? DomUtils.getOuterHTML(child, { xmlMode: true })
      : DomUtils.textContent(child)).join("").trim();
  }
  return "";
}

function officialItemUrl(value: string, source: CallSource) {
  if (!value || value.length > 1000) return "";
  const catalogue = new URL(source.url);
  try {
    const url = new URL(value, catalogue);
    const prefix = `${catalogue.pathname.replace(/\/$/, "")}/`;
    if (url.origin !== catalogue.origin || url.username || url.password || !url.pathname.startsWith(prefix) || url.pathname === prefix) return "";
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

function published(value: string) {
  if (!/^(?:\d{4}-\d\d-\d\dT|[A-Za-z]{3}, \d{1,2} [A-Za-z]{3} \d{4} )/.test(value) || !/(?:Z|GMT|[+-]\d{2}:?\d{2})$/i.test(value)) return undefined;
  const stamp = Date.parse(value);
  return Number.isFinite(stamp) ? new Date(stamp).toISOString() : undefined;
}

function nsfDeadline(description: string) {
  // NSF labels a standalone first line. A preliminary or multi-date line cannot set the closing date.
  const firstLine = plainText(description.split(/<br\s*\/?>/i, 1)[0], 150);
  const parts = /^Full Proposal Deadline Date: ([A-Z][a-z]+) (\d{1,2}), (\d{4})$/.exec(firstLine);
  if (!parts) return "";
  const [, month, day, year] = parts;
  return `${year}-${String(englishMonths.indexOf(month) + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function parseCallFeed(xml: string, source: CallSource): CallFeedItem[] {
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) throw httpError("La fuente contiene declaraciones XML no admitidas", 502);
  const roots = parseDocument(xml, { xmlMode: true, decodeEntities: true }).children.filter(DomUtils.isTag);
  if (roots.length !== 1) throw httpError("La fuente no devolvió un canal válido", 502);
  const root = roots[0], atom = localName(root) === "feed";
  const container = atom ? root : localName(root) === "rss"
    ? root.children.filter(DomUtils.isTag).find(element => localName(element) === "channel") : undefined;
  if (!container) throw httpError("La fuente no devolvió un canal RSS o Atom", 502);

  const seenIds = new Set<string>(), seenUrls = new Set<string>();
  const results: CallFeedItem[] = [];
  const entries = container.children.filter(DomUtils.isTag).filter(element => localName(element) === (atom ? "entry" : "item"));
  for (const entry of entries) {
    const alternate = atom ? entry.children.filter(DomUtils.isTag).find(child =>
      localName(child) === "link" && (!child.attribs.rel || child.attribs.rel === "alternate") && child.attribs.href) : undefined;
    const url = officialItemUrl(alternate?.attribs.href || field(entry, "link"), source);
    const title = plainText(field(entry, "title"), 200);
    if (!url || !title || seenUrls.has(url)) continue;
    const identifier = field(entry, atom ? "id" : "guid").slice(0, 1000);
    const id = createHash("sha256").update(identifier || url).digest("hex");
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    seenUrls.add(url);
    const publishedAt = published(field(entry, atom ? "published" : "pubDate", "date"));
    const description = field(entry, "description", "summary", "content", "encoded");
    const deadline = field(entry, "deadline", "closingDate") || (source.id === "nsf-us" ? nsfDeadline(description) : "");
    results.push({
      id, title, url,
      summary: plainText(description, 1200),
      ...(publishedAt ? { publishedAt } : {}),
      ...(isValidYmd(deadline) ? { deadline } : {}),
    });
    if (results.length >= MAX_ITEMS) break;
  }
  if (entries.length && !results.length) throw httpError("El canal cambió el formato de sus convocatorias", 502);
  return results;
}

async function readFeedResponse(response: Response) {
  const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (!response.ok || response.redirected || !response.body || !contentType || !["application/rss+xml", "application/atom+xml", "application/xml", "text/xml"].includes(contentType)) {
    await response.body?.cancel();
    throw httpError("La fuente no devolvió un canal RSS o Atom disponible", 502);
  }
  if (Number(response.headers.get("content-length")) > MAX_BYTES) {
    await response.body.cancel();
    throw httpError("El canal supera el tamaño de lectura permitido", 413);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const parts: string[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw httpError("El canal supera el tamaño de lectura permitido", 413);
      parts.push(decoder.decode(value, { stream: true }));
    }
    parts.push(decoder.decode());
    return parts.join("");
  } catch (error) {
    await reader.cancel().catch(() => {});
    if ((error as { status?: number }).status === 413) throw error;
    throw httpError("No se pudo leer el canal de convocatorias", 502);
  } finally {
    reader.releaseLock();
  }
}

/** Only fixed public feeds are fetched, without credentials, filters or redirects. */
export async function readCallSource(id: string, options: FetchOptions = {}): Promise<CallFeedItem[]> {
  const source = CALL_SOURCES.find(item => item.id === id);
  if (!source) throw httpError("Fuente de convocatorias desconocida", 404);
  if (!source.feedUrl) throw httpError("Esta fuente se consulta en su sitio oficial", 422);
  if (activeSources.has(id)) throw httpError("Ya se está consultando esta fuente", 429);
  activeSources.add(id);
  try {
    const timeout = AbortSignal.timeout(10_000);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    let response: Response;
    try {
      response = await (options.fetch || fetch)(source.feedUrl, {
        method: "GET", redirect: "error", credentials: "omit", cache: "no-store", signal,
        headers: { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml", "User-Agent": "LexOpen/1.1 (public funding feeds)" },
      });
    } catch {
      throw httpError("La fuente no respondió. Intenta actualizarla más tarde", 502);
    }
    return parseCallFeed(await readFeedResponse(response), source);
  } finally {
    activeSources.delete(id);
  }
}
