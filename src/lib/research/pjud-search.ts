import { z } from "zod";
import { requestPjudJudgments } from "./pjud-judgments";
export const pjudSearchSchema = z.object({
  terms: z.string().trim().max(200).default(""),
  rol: z.string().trim().regex(/^(?:[A-Za-z]{1,3}-)?[1-9]\d{0,8}(?:-\d{4})?$|^$/).default(""),
  page: z.number().int().min(0).max(19).default(0),
}).strict().refine(v => v.terms.length >= 3 || v.rol.length > 0, "Ingrese un ROL o al menos tres caracteres");
export type PjudSearchInput = z.infer<typeof pjudSearchSchema>;
export type PjudSearchResult = { page: number; totalReported: number; nextPage: number | null; warnings: string[]; items: { id: string; rol: string; title: string; tribunal: string; importUrl: string }[] };
export async function searchPjud(input: PjudSearchInput, transport: Parameters<typeof requestPjudJudgments>[1], signal: AbortSignal, limit: number, read: Parameters<typeof requestPjudJudgments>[4]): Promise<PjudSearchResult> {
  const checked = pjudSearchSchema.parse(input);
  const parts = /^(?:[A-Za-z]{1,3}-)?([1-9]\d{0,8})(?:-(\d{4}))?$/.exec(checked.rol);
  const filters = { rol: parts?.[1] || "", era: parts?.[2] || "", todas: checked.terms, algunas: "", excluir: "", literal: "", fec_desde: "", fec_hasta: "", proximidad: "", distancia: "", submaterias: "", facetas_seleccionadas: {}, filtros_omnibox: [], ids_comunas_seleccionadas_mapa: "" };
  const { payload } = await requestPjudJudgments(filters, transport, signal, limit, read, checked.page * 10);
  const response = payload?.response;
  const fail = () => Object.assign(new Error("El Buscador Unificado devolvió resultados incompatibles con la consulta. Revise el portal oficial."), { status: 502 });
  if (!response || !Number.isSafeInteger(response.numFound) || response.numFound < 0 || !Array.isArray(response.docs) || response.docs.length > 10 || response.docs.length > response.numFound) throw fail();
  const offset = checked.page * 10;
  if (response.start !== undefined && response.start !== offset) throw fail();
  if (response.docs.length && offset + response.docs.length > response.numFound) throw fail();
  const ids = new Set<string>();
  const items = response.docs.map((doc: Record<string, unknown>) => {
    if (!doc || typeof doc !== "object") throw fail();
    const id = String(doc.id);
    const rol = typeof doc.rol_era_sup_s === "string" ? doc.rol_era_sup_s : "";
    if (!/^[1-9]\d{0,14}$/.test(id) || ids.has(id)) throw fail();
    ids.add(id);
    const returned = /^(?:[A-Za-z]{1,3}-)?0*(\d+)-(\d{4})$/.exec(rol);
    if (parts && (!returned || returned[1] !== parts[1] || (parts[2] && returned[2] !== parts[2]))) throw fail();
    const field = (value: unknown) => typeof value === "string" ? value.slice(0, 500) : "";
    return { id, rol: rol.slice(0, 120), title: field(doc.caratulado_s), tribunal: field(doc.gls_juz_s), importUrl: `https://juris.pjud.cl/busqueda?Civiles#sentencia-${id}` };
  });
  return { page: checked.page, totalReported: response.numFound, nextPage: items.length === 10 && (checked.page + 1) * 10 < response.numFound && checked.page < 19 ? checked.page + 1 : null,
    items, warnings: ["Resultados remotos civiles: no son citas ni texto íntegro incorporado. Seleccione e incorpore un fallo antes de citarlo.", "El total es declarado por el portal y no acredita cobertura. Los términos no se verifican contra el fallo íntegro durante esta búsqueda."] };
}
