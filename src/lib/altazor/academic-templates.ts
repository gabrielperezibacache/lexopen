import type { AcademicMode } from "./academic-schemas";

export type AcademicJourney = "research" | "writing" | "course";
export const ACADEMIC_JOURNEYS = [
  { id: "research", label: "Investigar", description: "De una pregunta a una revisión con fuentes.", initialMode: "literature_review", modes: ["literature_review", "synthesis", "comparison", "claim_audit", "bibliography_audit"] },
  { id: "writing", label: "Escribir", description: "Desarrolla, revisa y prepara tu texto.", initialMode: "academic_writing", modes: ["academic_writing", "abstract", "peer_review", "translation", "cv"] },
  { id: "course", label: "Enseñar", description: "Organiza un curso, sus materiales y evaluación.", initialMode: "syllabus", modes: ["syllabus", "rubric", "teaching_material"] },
] as const satisfies readonly { id: AcademicJourney; label: string; description: string; initialMode: AcademicMode; modes: readonly AcademicMode[] }[];

export function academicJourney(kind: string): AcademicJourney {
  return kind === "course" ? "course" : kind === "writing" || kind === "career" ? "writing" : "research";
}
export function academicHref(workspaceId?: string, artifactId?: string) {
  const query = new URLSearchParams();
  if (workspaceId) query.set("trabajo", workspaceId);
  if (artifactId) query.set("resultado", artifactId);
  return `/academico${query.size ? `?${query}` : ""}`;
}
export const ACADEMIC_INSTRUCTIONS: Record<AcademicMode, string> = {
  literature_review: "Organiza el estado del arte sobre la pregunta del trabajo. Distingue consensos, desacuerdos, métodos y vacíos de investigación en las fuentes elegidas.",
  synthesis: "Sintetiza los argumentos principales de las fuentes elegidas, sus límites y su relación con la pregunta del trabajo.",
  comparison: "Compara las tesis, métodos, evidencia y límites de los documentos elegidos. Identifica acuerdos y diferencias sin equiparar enfoques distintos.",
  claim_audit: "Revisa las afirmaciones del texto aportado frente a los pasajes elegidos. Distingue respaldo directo, inferencia y afirmación sin respaldo.",
  bibliography_audit: "Revisa las referencias aportadas y su relación con los pasajes elegidos. Señala datos faltantes y límites de verificación sin completar información desconocida.",
  academic_writing: "Prepara una propuesta de texto académico que responda al objetivo del trabajo. Formula una tesis, desarrolla los argumentos y explicita sus límites.",
  translation: "Traduce el texto que aportaré al idioma indicado en el trabajo, conservando el sentido, las citas y la terminología especializada.",
  abstract: "Prepara un resumen académico con pregunta, enfoque, resultados aportados y conclusión. No inventes resultados que no estén en el texto o las fuentes.",
  peer_review: "Revisa la claridad de la pregunta, la estructura, el razonamiento y el respaldo del texto aportado. Propón mejoras concretas y distingue corrección de sugerencia.",
  syllabus: "Diseña una propuesta de programa según los destinatarios, duración y resultados de aprendizaje del trabajo. Relaciona contenidos, actividades y evaluación.",
  rubric: "Prepara una rúbrica con criterios observables, niveles de logro y descriptores diferenciados para la actividad indicada.",
  teaching_material: "Prepara material docente para los destinatarios indicados: explicación, ejemplo jurídico y actividad de aplicación con criterios para revisarla.",
  cv: "Organiza mi perfil académico guardado en una propuesta de currículum. Utiliza sólo los antecedentes aportados y señala los datos que faltan.",
};

export function academicTextStats(text: string) {
  const words = text.trim().match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)?.length || 0;
  return { words, characters: Array.from(text).length, paragraphs: text.trim() ? text.trim().split(/\n\s*\n/).length : 0, readingMinutes: words ? Math.max(1, Math.ceil(words / 220)) : 0 };
}
export function academicOutline(text: string) {
  let offset = 0;
  return text.split("\n").flatMap(line => {
    const start = offset; offset += line.length + 1;
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    return match ? [{ title: match[2], level: match[1].length, offset: start }] : [];
  });
}

// Preserve line breaks, quoted wording and citation markers. This is a local
// typography operation, not a claim of substantive or bibliographic review.
export function tidyAcademicSpacing(text: string) {
  return text.replace(/\r\n?/g, "\n").split("\n").map(line => line.replace(/[\t ]+$/g, "")).join("\n").replace(/\n{4,}/g, "\n\n\n");
}
