import { DomUtils, parseDocument } from "htmlparser2";
import type { FetchedLegalSource } from "./source-types";

const BASE = "https://juris.pjud.cl";
const fail = () => Object.assign(new Error("El Buscador Unificado no entregó un fallo íntegro identificable. Reintente o revise la fuente oficial."), { status: 502, code: "pjud_judgment_unavailable" });
type Transport = (url: string, init: RequestInit) => Promise<Response>;
type Reader = (response: Response, signal: AbortSignal, limit: number) => Promise<Buffer>;
/** A fresh anonymous session per request/page prevents observed filter degradation. */
export async function requestPjudJudgments(filters: Record<string, unknown>, transport: Transport, signal: AbortSignal, maxBytes: number, read: Reader, offset = 0) {
  const request = async (path: string, init: RequestInit = {}) => {
    const response = await transport(`${BASE}${path}`, { ...init, redirect: "error", credentials: "omit", cache: "no-store", signal });
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
  return { payload, rawBytes };
}
export async function fetchPjudJudgment(canonicalUrl: string, id: string, transport: Transport, signal: AbortSignal, maxBytes: number, read: Reader): Promise<FetchedLegalSource> {
  const { payload, rawBytes } = await requestPjudJudgments({ id: Number(id) }, transport, signal, maxBytes, read);
  const docs = payload?.response?.docs;
  if (!Array.isArray(docs) || docs.length !== 1 || String(docs[0]?.id) !== id) throw fail();
  const doc = docs[0];
  // A preview or a literal anonymization placeholder cannot substantiate a citation.
  const anonymized = Number(doc.sit_fallo_anonimizado_i) === 1;
  const suppliedText = anonymized && typeof doc.texto_sentencia_anon === "string" ? doc.texto_sentencia_anon : doc.texto_sentencia;
  const rawText = typeof suppliedText === "string" ? suppliedText : "";
  const textDom = parseDocument(rawText);
  DomUtils.findAll(node => ["script", "style"].includes(node.name), textDom.children).forEach(node => DomUtils.removeElement(node));
  const text = textDom.children.map(node => DomUtils.innerText(node)).join("\n").trim();
  if (!text || /^ANONIMIZAD[OA]$/i.test(text) || text.length > 2_000_000) throw fail();
  const rol = typeof doc.rol_era_sup_s === "string" ? doc.rol_era_sup_s : "";
  return { canonicalUrl, retrievalUrl: `${BASE}/busqueda/buscar_sentencias`, title: `Sentencia PJUD ${rol || id}`,
    organism: "Poder Judicial de Chile", kind: "jurisprudence", externalId: `PJUD:${id}`, text, rawBytes,
    mimeType: "application/json", retrievedAt: new Date(), coverageWarnings: [
      "Fuente pública experimental: no acredita cobertura exhaustiva ni vigencia del criterio judicial.",
      "Se conserva la respuesta JSON recibida, no un PDF original. Las citas no tienen página física.",
      ...(anonymized ? ["La fuente informa anonimización: revise las omisiones en el texto conservado."] : []),
    ] };
}
