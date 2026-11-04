import { z } from "zod";
import { httpError } from "@/lib/auth/access";
import type { AltazorSourceSnapshot } from "./resources";
const output = z.object({ sections: z.array(z.object({ heading: z.string().max(200), text: z.string().min(1).max(12000), referenceIds: z.array(z.string().regex(/^R[1-8]$/)).max(8) }).strict()).min(1).max(20) }).strict();
/** A model marker is only a reference to an already verified selection, never a new citation. */
export function parseAcademicOutput(content: string, refs: AltazorSourceSnapshot[]) {
  let raw: unknown;
  try { raw = JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); } catch { throw httpError("La respuesta no contiene secciones y referencias válidas. Puede preparar otro intento", 409); }
  const parsed = output.safeParse(raw);
  if (!parsed.success) throw httpError("La respuesta académica no respeta el formato de revisión", 409);
  return parsed.data.sections.map(section => {
    const displayed = `${section.heading}\n${section.text}`;
    const ids = [...new Set(section.referenceIds.map(id => Number(id.slice(1)) - 1))];
    if (ids.some(id => !refs[id]) || /https?:\/\/|\[\^|\[(?:R?\d+)\]/.test(displayed) || refs.length && !ids.length) throw httpError("La IA añadió referencias ajenas o dejó afirmaciones sin vincular. No se conservó esa respuesta", 409);
    const quotes = [...displayed.matchAll(/“([^”]+)”|«([^»]+)»|"([^"\n]+)"/gu)].map(match => match[1] || match[2] || match[3]);
    if (refs.length && quotes.some(quote => !ids.some(id => refs[id].text.includes(quote)))) throw httpError("Una cita textual no aparece en los pasajes seleccionados", 409);
    return `${section.heading ? `## ${section.heading}\n\n` : ""}${section.text}${ids.length ? ` ${ids.map(id => `[R${id + 1}]`).join(" ")}` : ""}`;
  }).join("\n\n");
}
export function academicReferenceAppendix(refs: AltazorSourceSnapshot[]) {
  return refs.length ? `\n\n## Fuentes seleccionadas\n\n${refs.map((source, index) => `[R${index + 1}] ${source.title}\n${source.citations.map(citation => citation.locator).join("; ")}\n${source.text}\n${source.href}\n${source.warnings.join("\n")}`).join("\n\n")}` : "\n\nSin fuentes documentales seleccionadas. Este contenido requiere revisión y respaldo independiente.";
}

/** Keep selected-source IDs aligned with the native writing footnote grammar. */
export function academicWritingBody(body: string, sourceCount: number) {
  return body.replace(/\[\^?(R[1-9][0-9]*)\]/g, (_marker, id: string) => {
    const number = Number(id.slice(1));
    if (!Number.isSafeInteger(number) || number > sourceCount) throw httpError("La revisión contiene una referencia sin respaldo seleccionado. Corríjala antes de incorporarla", 409);
    return `[^${id}]`;
  });
}
