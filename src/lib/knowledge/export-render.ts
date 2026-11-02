import type { readCaseKnowledge } from "./cases";
import type { ResolvedCitation } from "./citations";
import { csvDocument } from "@/lib/billing-export";
import { formatAudioTranscriptNotice } from "./audio-transcript";

export type KnowledgeExportSnapshot = Awaited<ReturnType<typeof readCaseKnowledge>>;
export type KnowledgeExportQuery = { q?: string; status?: string; after?: string };
const states: Record<string, string> = { proposed: "Propuesto", accepted: "Revisado", rejected: "Descartado", hidden: "Oculto" };
const precisions: Record<string, string> = { unknown: "Sin determinar", ambiguous: "Ambigua", day: "Día", month: "Mes completo", year: "Año completo", range: "Rango" };
const conflictStates: Record<string, string> = { proposed: "Propuesta", apparent: "Discrepancia aparente", confirmed: "Confirmada por revisión", rejected: "Descartada" };
// Untrusted source text stays text in Markdown, including HTML and new headings.
const text = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/([\\`*_\[\]#!|])/g, "\\$1");
const line = (value: string) => text(value).replace(/[\r\n]+/g, " ");
const quotation = (value: string) => value.split(/\r\n?|\n/).map(part => `> ${text(part).replace(/^(\s*)([-+=])/, "$1\\$2").replace(/^(\s*\d+)([.)])/, "$1\\$2")}`);
const href = (value: string) => /^\/(?!\/)/.test(value) ? value.replace(/[()\s<>]/g, char => encodeURIComponent(char)) : "";
const locator = (citation: ResolvedCitation) => citation.audioTranscript
  ? "Pasaje de transcripción TXT; cotejar escuchando la grabación"
  : citation.pageNumber ? `Página física ${citation.pageNumber}` : "Pasaje de texto; sin página física";

function scope(snapshot: KnowledgeExportSnapshot, query: KnowledgeExportQuery) {
  return [
    snapshot.coverage.chronologyScope,
    `Filtros: búsqueda ${query.q || "sin filtro"}; estado ${states[query.status || ""] || "todos"}; ${query.after ? "página posterior al cursor solicitado" : "primera página"}.`,
    "Se exportan sólo hechos activos de esta página. Los descartados y ocultos quedan fuera. No es un inventario completo ni una conclusión judicial.",
    "Citas cotejadas con el material conservado al generar el archivo. El acceso y las fuentes pueden cambiar después de esta descarga.",
    ...(snapshot.restricted ? ["Se omitió conocimiento cuya evidencia ya no está disponible o autorizada."] : []),
    ...(snapshot.coverage.factsLimited ? ["Hay más hechos; esta exportación no incorpora las páginas siguientes."] : []),
    ...(snapshot.coverage.verificationLimited ? ["Se alcanzó la ventana de verificación; parte del expediente queda fuera de este alcance."] : []),
    ...(snapshot.coverage.conflictsLimited ? ["Se alcanzó el límite de contradicciones mostradas."] : []),
  ];
}
function citationNotes(citation: ResolvedCitation) {
  return [
    ...(!citation.isCurrent ? ["Existe una revisión posterior de la fuente"] : []),
    ...(citation.partial ? ["Extracción parcial"] : []),
    ...(citation.audioTranscript ? [formatAudioTranscriptNotice(citation.audioTranscript)] : []),
    ...citation.warnings,
  ];
}

/** Pure renderer. Call only with a fresh, authorized readCaseKnowledge snapshot. */
export function renderKnowledgeMarkdown(snapshot: KnowledgeExportSnapshot, query: KnowledgeExportQuery, generatedAt: string) {
  const facts = [...snapshot.chronology.dated, ...snapshot.chronology.undated];
  const ids = new Set(facts.map(fact => fact.id));
  const lines = ["# Hoja de preparación de la causa", "", `Causa: ${line(snapshot.caseIdentity.titulo)}`, "", `RIT: ${line(snapshot.caseIdentity.rit || "Sin RIT")} · Identificador LexOpen: ${line(snapshot.caseIdentity.id)}`, "", `Generada por LexOpen: ${line(generatedAt)}.`, "", "## Alcance y revisión", "", ...scope(snapshot, query).map(value => `- ${line(value)}`), "", "## Hechos y respaldo", ""];
  if (!facts.length) lines.push("No hay hechos activos en este alcance.", "");
  const references: ResolvedCitation[] = [];
  // Retain every quotation separately: one fragment can support distinct excerpts.
  for (const fact of facts) {
    lines.push(`### ${line(fact.statement)}`, "", `${states[fact.status] || line(fact.status)} · Revisión ${fact.revision}${fact.highlighted ? " · Destacado" : ""}`, "",
      `Fecha: ${fact.dateStart || "Sin fecha normalizada"}${fact.dateEnd && fact.dateEnd !== fact.dateStart ? ` a ${fact.dateEnd}` : ""} · ${precisions[fact.datePrecision] || line(fact.datePrecision)}${fact.dateInferred ? " · Interpretada por revisión" : ""}.`, "");
    if (fact.dateLiteral) lines.push(`Expresión de la fuente: ${line(fact.dateLiteral)}`, "");
    if (fact.inferenceReason) lines.push(`Motivo de interpretación: ${line(fact.inferenceReason)}`, "");
    const warnings = [...fact.warnings, ...(fact.stale ? ["Revisar respaldo: las fuentes cambiaron o tienen revisiones posteriores."] : []), ...(fact.citationsLimited ? [`Referencias acotadas: ${fact.citations.length} de ${fact.citationCount}.`] : [])];
    warnings.forEach(warning => lines.push(`Aviso: ${line(warning)}`, ""));
    for (const citation of fact.citations) {
      references.push(citation);
      lines.push(`Respaldo [${references.length}]: ${line(citation.title)} · ${line(locator(citation))}`, "", ...quotation(citation.quote), "");
    }
  }
  lines.push("## Contradicciones pendientes de contexto", "");
  const conflicts = snapshot.conflicts.filter(conflict => ids.has(conflict.leftFactId) && ids.has(conflict.rightFactId) && conflict.status !== "rejected");
  if (!conflicts.length) lines.push("Sin contradicciones activas documentadas en los hechos de este alcance. Esto no acredita su inexistencia.", "");
  for (const conflict of conflicts) {
    lines.push(`### ${conflictStates[conflict.status] || line(conflict.status)}`, "", line(conflict.reason), "");
    for (const id of [conflict.leftFactId, conflict.rightFactId]) lines.push(`- ${line(facts.find(fact => fact.id === id)!.statement)}`);
    if (conflict.stale) lines.push("", "Aviso: cambió un hecho o su evidencia; revisar la comparación.");
    lines.push("");
  }
  lines.push("## Referencias para volver al origen", "", "Los enlaces relativos se abren dentro de su instalación de LexOpen y requieren acceso vigente.", "");
  references.forEach((citation, index) => {
    const target = href(citation.href);
    lines.push(`### Referencia ${index + 1}`, "", `${line(citation.title)} · ${line(locator(citation))}`, "",
      target ? `[Abrir pasaje en LexOpen](${target})` : "Localización no disponible.", "",
      `Versión: ${line(citation.versionId)} · Fragmento: ${line(citation.fragmentId)}`, "",
      `SHA-256 de la cita: ${line(citation.quoteSha256)}`, "");
    citationNotes(citation).forEach(warning => lines.push(`Aviso: ${line(warning)}`, ""));
  });
  return lines.join("\n");
}

/** One row per supporting citation; undated events retain their uncertainty. */
export function renderChronologyCsv(snapshot: KnowledgeExportSnapshot, query: KnowledgeExportQuery, generatedAt: string) {
  const headers = ["Tipo", "Fecha inicial", "Fecha final", "Precisión", "Fecha literal", "Interpretada", "Hecho", "Estado", "Revisión", "Fuente", "Localizador", "Cita literal", "Enlace LexOpen", "Versión", "SHA-256 cita", "Avisos", "Generado", "Alcance", "Causa", "RIT", "Identificador LexOpen"];
  const rows: Array<Array<string | number>> = [];
  const coverage = scope(snapshot, query).join(" ");
  for (const fact of [...snapshot.chronology.dated, ...snapshot.chronology.undated]) {
    for (const citation of fact.citations) {
      rows.push(["Hecho", fact.dateStart || "", fact.dateEnd || "", precisions[fact.datePrecision] || fact.datePrecision, fact.dateLiteral || "", fact.dateInferred ? `Sí: ${fact.inferenceReason || "ver revisión"}` : "No", fact.statement, states[fact.status] || fact.status, fact.revision, citation.title, locator(citation), citation.quote, href(citation.href), citation.versionId, citation.quoteSha256,
        [...fact.warnings, ...(fact.stale ? ["Revisar respaldo actualizado"] : []), ...(fact.citationsLimited ? ["Referencias acotadas"] : []), ...citationNotes(citation)].join("; "), generatedAt, coverage]);
    }
  }
  // The scope remains visible even if an empty/revoked page has no data rows.
  rows.push(["Alcance", "", "", "", "", "", "", "", "", "", "", "", "", "", "", coverage, generatedAt, coverage]);
  // Preserve leading whitespace without letting a spreadsheet interpret a formula.
  return csvDocument(headers, rows.map(row => [...row, snapshot.caseIdentity.titulo, snapshot.caseIdentity.rit || "Sin RIT", snapshot.caseIdentity.id].map(value => typeof value === "string" && /^[\s\uFEFF]*[=+\-@]/.test(value) ? `'${value}` : value)));
}
