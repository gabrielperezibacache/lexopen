import { DomUtils, parseDocument } from "htmlparser2";
import type { FetchedLegalSource } from "./source-types";

const BASE = "https://juris.pjud.cl";
const fail = () => Object.assign(new Error("El Buscador Unificado no entregó un fallo íntegro identificable. Reintente o revise la fuente oficial."), { status: 502, code: "pjud_judgment_unavailable" });
type Transport = (url: string, init: RequestInit) => Promise<Response>;
type Reader = (response: Response, signal: AbortSignal, limit: number) => Promise<Buffer>;
class PjudSessionExpired extends Error {}

/** A fresh anonymous session per request/page prevents observed filter degradation. */
async function requestPjudJudgmentsOnce(filters: Record<string, unknown>, transport: Transport, signal: AbortSignal, maxBytes: number, read: Reader, offset = 0) {
  const request = async (path: string, init: RequestInit = {}) => {
    const response = await transport(`${BASE}${path}`, { ...init, redirect: "error", credentials: "omit", cache: "no-store", signal });
    if (response.status === 419 && path === "/busqueda/buscar_sentencias") {
      await response.body?.cancel();
      throw new PjudSessionExpired();
    }
    if (!response.ok || response.redirected) { await response.body?.cancel(); throw fail(); }
    return response;
  };
  // Never borrow OJV/ClaveÚnica cookies. These cookies live only in this invocation.
  const session = await request("/busqueda?Civiles");
  const cookies = session.headers.getSetCookie().map(value => value.split(";", 1)[0]);
  if (cookies.some(value => !/^[!#$%&'*+.^_`|~\w-]+=[^\r\n;]*$/.test(value))) throw fail();
  const html = (await read(session, signal, maxBytes)).toString("utf8");
  const dom = parseDocument(html);
  const token = DomUtils.findOne(node => node.name === "input" && node.attribs.name === "_token", dom.children, true)?.attribs.value;
  const searchId = /id_buscador_activo\s*=\s*(\d+)/.exec(html)?.[1];
  if (!token || !searchId || !cookies.length) throw fail();
  const body = new URLSearchParams({ _token: token, id_buscador: searchId, filtros: JSON.stringify(filters), numero_filas_paginacion: "10", offset_paginacion: String(offset), orden: "1", orden_nombre: "Relevancia" }).toString();
  const response = await request("/busqueda/buscar_sentencias", { method: "POST", body,
    headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest", "X-CSRF-TOKEN": token, Cookie: cookies.join("; ") } });
  if (!/^application\/json\b/i.test(response.headers.get("content-type") || "")) { await response.body?.cancel(); throw fail(); }
  const rawBytes = await read(response, signal, maxBytes);
  let payload;
  try { payload = JSON.parse(rawBytes.toString("utf8")); } catch { throw fail(); }
  return { payload };
}
/** A single CSRF retry starts over: no old cookies/token or old request body survive. */
export async function requestPjudJudgments(filters: Record<string, unknown>, transport: Transport, signal: AbortSignal, maxBytes: number, read: Reader, offset = 0) {
  for (let attempt = 0; ; attempt++) {
    if (signal.aborted) throw fail();
    try { return await requestPjudJudgmentsOnce(filters, transport, signal, maxBytes, read, offset); }
    catch (error) {
      if (!(error instanceof PjudSessionExpired)) throw error;
      if (attempt !== 0 || signal.aborted) throw fail();
    }
  }
}
// Keep names and other unexpected free text out of the case identifier displayed in search.
export function publicJudgmentRol(value: unknown) {
  return typeof value === "string" && /^(?:[A-Za-z]{1,3}-)?\d{1,9}-\d{4}$/.test(value.trim()) ? value.trim() : "";
}

/** A deterministic public record. Repeated retrieval preserves the same file hash. */
export function publicJudgmentFile(source: string, id: string, rol: string, text: string) {
  return Buffer.from(JSON.stringify({ format: "lexopen.pjud.public.v1", id, rol, source, text }), "utf8");
}

export async function fetchPjudJudgment(canonicalUrl: string, id: string, transport: Transport, signal: AbortSignal, maxBytes: number, read: Reader): Promise<FetchedLegalSource> {
  const { payload } = await requestPjudJudgments({ id: Number(id) }, transport, signal, maxBytes, read);
  const docs = payload?.response?.docs;
  if (!Array.isArray(docs) || docs.length !== 1 || String(docs[0]?.id) !== id) throw fail();
  const doc = docs[0];
  const flag = doc.sit_fallo_anonimizado_i;
  const publicVariant = doc.texto_sentencia_anon;
  // A supplied public variant wins even when the flag says otherwise. Only an
  // explicitly unmarked row may treat an empty variant as an unused field.
  const explicitlyUnmarked = [0, "0", false].includes(flag);
  const hasPublicVariant = publicVariant != null && (typeof publicVariant !== "string" || Boolean(publicVariant.trim()));
  const anonymized = hasPublicVariant || (!explicitlyUnmarked && (flag != null || Object.hasOwn(doc, "texto_sentencia_anon")));
  const suppliedText = anonymized ? publicVariant : doc.texto_sentencia;
  const rawText = typeof suppliedText === "string" ? suppliedText : "";
  const textDom = parseDocument(rawText);
  DomUtils.findAll(node => ["script", "style", "template", "noscript"].includes(node.name)
    || Object.hasOwn(node.attribs, "hidden") || node.attribs["aria-hidden"] === "true"
    || /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\b/i.test(node.attribs.style || ""), textDom.children)
    .forEach(node => DomUtils.removeElement(node));
  const text = textDom.children.map(node => DomUtils.innerText(node)).join("\n").trim();
  const placeholder = /^(?:(?:texto|fallo|sentencia)\s+)?(?:anonimizad[oa]s?|reservad[oa]s?|no\s+disponible|sin\s+texto)$/i;
  if (!text || placeholder.test(text.replace(/[\[\]().!]/g, "").trim())) {
    throw Object.assign(new Error("Texto público no disponible."), { status: 422, code: "pjud_public_text_unavailable" });
  }
  if (text.length > 2_000_000) throw fail();
  const rol = publicJudgmentRol(doc.rol_era_sup_s);
  // A stable derivative for the same public text. No portal envelopes, hidden HTML, previews or session values.
  const rawBytes = publicJudgmentFile(canonicalUrl, id, rol, text);
  return { canonicalUrl, retrievalUrl: `${BASE}/busqueda/buscar_sentencias`, title: `Sentencia PJUD ${rol || id}`,
    organism: "Poder Judicial de Chile", kind: "jurisprudence", externalId: `PJUD:${id}`, text, rawBytes,
    pjudPublicCopy: { rol }, mimeType: "application/json", retrievedAt: new Date(), coverageWarnings: [
      "Fuente pública experimental: no acredita cobertura exhaustiva ni vigencia del criterio judicial.",
      "La copia conserva el texto público recuperado. Las citas se identifican por fragmento.",
      ...(anonymized ? ["La fuente informa anonimización: revise las omisiones en el texto conservado."] : []),
    ] };
}
