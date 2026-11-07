import { SANTIAGO_TZ, santiagoDateKey } from "@/lib/chile-time";
import type { AcademicMode, emptyAcademicBrief } from "./academic-schemas";
import type { TeachingSessionContent } from "./teaching-session-content";

export type AcademicJourney = "research" | "writing" | "course";
export const ACADEMIC_JOURNEYS = [
  { id: "research", label: "Investigar", description: "De una pregunta a una revisión con fuentes.", initialMode: "literature_review", modes: ["literature_review", "synthesis", "comparison", "claim_audit", "bibliography_audit"] },
  { id: "writing", label: "Escribir", description: "Desarrolla, revisa y prepara tu texto.", initialMode: "academic_writing", modes: ["academic_writing", "abstract", "peer_review", "translation", "cv"] },
  { id: "course", label: "Enseñar", description: "Organiza un curso, sus materiales y evaluación.", initialMode: "syllabus", modes: ["syllabus", "rubric", "teaching_material"] },
] as const satisfies readonly { id: AcademicJourney; label: string; description: string; initialMode: AcademicMode; modes: readonly AcademicMode[] }[];

export function academicJourney(kind: string): AcademicJourney {
  return isAcademicTeachingKind(kind) ? "course" : kind === "writing" || kind === "career" ? "writing" : "research";
}
export function academicHref(workspaceId?: string, artifactId?: string) {
  const query = new URLSearchParams();
  if (workspaceId) query.set("trabajo", workspaceId);
  if (artifactId) query.set("resultado", artifactId);
  return `/academico${query.size ? `?${query}` : ""}`;
}

export const ACADEMIC_CALLS_HREF = "/academico?vista=docencia#convocatorias-oficiales";

const teachingProgramSections = {
  seminar: "Programa y ponentes",
  congress: "Programa y mesas",
  workshop: "Actividades y tiempos",
} as const;
export function isAcademicTeachingProgram(kind: string): kind is keyof typeof teachingProgramSections {
  return Object.hasOwn(teachingProgramSections, kind);
}

export const ACADEMIC_MANUSCRIPT_TEMPLATES = {
  blank: { label: "Documento en blanco", description: "Escribe con tu propia estructura.", headings: [] },
  article: { label: "Artículo académico", description: "Presenta una pregunta, su método y tus hallazgos.", headings: ["Resumen", "Palabras clave", "Introducción", "Marco teórico", "Metodología", "Resultados", "Discusión", "Conclusiones", "Referencias"] },
  legal_essay: { label: "Ensayo jurídico", description: "Desarrolla una tesis, sus objeciones y sus fundamentos.", headings: ["Problema jurídico", "Tesis", "Marco normativo y jurisprudencial", "Argumentación", "Objeciones y respuesta", "Conclusiones", "Referencias"] },
  thesis: { label: "Proyecto de tesis", description: "Delimita la investigación y organiza su ejecución.", headings: ["Problema y justificación", "Pregunta de investigación", "Objetivos", "Estado del arte", "Metodología", "Cronograma", "Referencias"] },
  paper: { label: "Ponencia", description: "Prepara una intervención para un encuentro académico.", headings: ["Resumen", "Problema y tesis", "Argumentos", "Conclusiones", "Preguntas para el diálogo", "Referencias"] },
  course: { label: "Programa de curso", description: "Planifica unidades, sesiones y evaluación.", headings: ["Descripción y destinatarios", "Resultados de aprendizaje", "Unidades y sesiones", "Metodología", "Evaluación", "Calendario", "Lecturas"] },
  seminar: { label: "Seminario", description: "Ordena sesiones, ponentes, lecturas y discusión.", headings: ["Propósito y destinatarios", teachingProgramSections.seminar, "Lecturas previas", "Preguntas de discusión", "Calendario y responsabilidades"] },
  congress: { label: "Congreso", description: "Prepara el programa y distribuye el trabajo del equipo.", headings: ["Tema y ejes", "Comité y responsabilidades", teachingProgramSections.congress, "Convocatoria y evaluación", "Inscripción y logística", "Hitos y plazos"] },
  workshop: { label: "Taller", description: "Diseña actividades, materiales y una pauta de evaluación.", headings: ["Resultados esperados", "Destinatarios y requisitos", teachingProgramSections.workshop, "Materiales", "Evaluación y seguimiento"] },
  call: { label: "Convocatoria", description: "Registra bases, elegibilidad, entregables y fechas clave.", headings: ["Entidad convocante y país", "Bases y fuente oficial", "Requisitos de elegibilidad", "Documentos y entregables", "Fechas y zona horaria", "Equipo y responsabilidades", "Seguimiento"] },
} as const;
export type AcademicManuscriptTemplate = keyof typeof ACADEMIC_MANUSCRIPT_TEMPLATES;
export const ACADEMIC_MANUSCRIPT_TEMPLATE_IDS = Object.keys(ACADEMIC_MANUSCRIPT_TEMPLATES) as [AcademicManuscriptTemplate, ...AcademicManuscriptTemplate[]];
export const ACADEMIC_TEACHING_TEMPLATES = ["course", "seminar", "congress", "workshop", "call"] as const;
export function isAcademicTeachingKind(kind: string): kind is (typeof ACADEMIC_TEACHING_TEMPLATES)[number] {
  return ACADEMIC_TEACHING_TEMPLATES.some(id => id === kind);
}

type ManuscriptSession = {
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  content: TeachingSessionContent;
};

const sessionDateTime = new Intl.DateTimeFormat("es-CL", { timeZone: SANTIAGO_TZ, dateStyle: "medium", timeStyle: "short", hourCycle: "h23" });
const sessionTime = new Intl.DateTimeFormat("es-CL", { timeZone: SANTIAGO_TZ, timeStyle: "short", hourCycle: "h23" });

function markdownSessionText(value: string) {
  return value.replace(/[\s\p{Cc}]+/gu, " ").trim().replace(/[\\`*\[\]]/g, "\\$&");
}

function manuscriptSessionBody({ title, startsAt, endsAt, content }: ManuscriptSession) {
  const start = sessionDateTime.format(startsAt);
  const end = endsAt && (santiagoDateKey(startsAt) === santiagoDateKey(endsAt) ? sessionTime : sessionDateTime).format(endsAt);
  const resourceLabel = ({ title, href }: TeachingSessionContent["readings"][number]) =>
    href ? `${markdownSessionText(title)} — ${href}` : markdownSessionText(title);
  const sections = [
    { label: "Resultados de aprendizaje", entries: content.outcomes.map(markdownSessionText) },
    { label: "Lecturas", entries: content.readings.map(resourceLabel) },
    { label: "Materiales", entries: content.materials.map(resourceLabel) },
  ];
  return [
    `### ${markdownSessionText(title)}`,
    `${end ? `${start} – ${end}` : start} (Santiago)`,
    ...sections.filter(({ entries }) => entries.length)
      .flatMap(({ label, entries }) => [`**${label}**`, entries.map(entry => `- ${entry}`).join("\n")]),
  ].join("\n\n");
}

export function academicManuscriptBody(
  templateId: AcademicManuscriptTemplate,
  title: string,
  brief: typeof emptyAcademicBrief,
  sessions: readonly ManuscriptSession[] = [],
) {
  if (templateId === "blank") return "";
  const heading = `# ${title.replace(/\s+/g, " ")}`;
  if (templateId === "call" && brief.call) {
    const { country, organization, url, deadline } = brief.call;
    const [entity, source, requirements, deliverables, dates, roles, followup] = ACADEMIC_MANUSCRIPT_TEMPLATES.call.headings;
    const countryName = country ? new Intl.DisplayNames(["es"], { type: "region" }).of(country) : "";
    return [heading, `## ${entity}`, [organization, countryName].filter(Boolean).join(" · "), `## ${source}`, url,
      `## ${requirements}`, `## ${deliverables}`, `## ${dates}`, deadline ? `Cierre registrado: ${deadline}` : "", `## ${roles}`, `## ${followup}`].filter(Boolean).join("\n\n");
  }
  if (templateId !== "course") {
    const sessionSection = isAcademicTeachingProgram(templateId) ? teachingProgramSections[templateId] : undefined;
    return [heading, ...ACADEMIC_MANUSCRIPT_TEMPLATES[templateId].headings.flatMap(label =>
      label === sessionSection ? [`## ${label}`, ...sessions.map(manuscriptSessionBody)] : [`## ${label}`],
    )].join("\n\n");
  }
  const fields = brief.syllabus;
  const blocks = [
    ["Resumen y enfoque", fields?.summary, fields?.approach],
    ["Destinatarios y requisitos", brief.audience, fields?.requirements],
    ["Horario y sala", fields?.schedule, fields?.room, brief.duration],
    ["Resultados de aprendizaje", brief.learningOutcomes],
    ["Unidades y sesiones", ...sessions.map(manuscriptSessionBody)],
    ["Evaluación", brief.evaluation],
    ["Bibliografía base", fields?.bibliography],
  ];
  return [heading, ...blocks.map(([label, ...contents]) => [`## ${label}`, ...contents.map(value => value?.trim()).filter(Boolean)].join("\n\n"))].join("\n\n");
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
