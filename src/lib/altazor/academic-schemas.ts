import { z } from "zod";
import { altazorSourceInputSchema } from "./resource-input";
import { ACADEMIC_MANUSCRIPT_TEMPLATE_IDS, ACADEMIC_TEACHING_TEMPLATES } from "./academic-templates";
import { isWorkCountry } from "@/lib/config/countries";
export const ACADEMIC_WORKSPACE_LIMIT = 100;
export const ACADEMIC_MODES = ["synthesis", "literature_review", "comparison", "claim_audit", "bibliography_audit", "academic_writing", "translation", "abstract", "peer_review", "syllabus", "rubric", "teaching_material", "cv"] as const;
export const academicModeSchema = z.enum(ACADEMIC_MODES);
export type AcademicMode = z.infer<typeof academicModeSchema>;
export const ACADEMIC_LABELS: Record<AcademicMode, string> = { synthesis: "Síntesis de fuentes", literature_review: "Estado del arte", comparison: "Comparar documentos", claim_audit: "Revisar afirmaciones", bibliography_audit: "Auditar bibliografía", academic_writing: "Escritura académica", translation: "Traducir un texto", abstract: "Preparar abstract", peer_review: "Revisión por pares", syllabus: "Diseñar un programa", rubric: "Crear rúbrica", teaching_material: "Material docente", cv: "Currículum académico" };
const requestId = z.string().min(10).max(120).regex(/^[a-zA-Z0-9-]+$/);
const revision = z.number().int().positive();
export const academicProfileSchema = z.object({ name: z.string().trim().max(180), headline: z.string().trim().max(300).default(""), orcid: z.string().regex(/^(?:\d{4}-\d{4}-\d{4}-\d{3}[\dX])?$/).default(""), biography: z.string().max(12000).default(""), education: z.string().max(12000).default(""), experience: z.string().max(12000).default(""), publications: z.string().max(20000).default(""), languages: z.string().max(1000).default(""), interests: z.string().max(2000).default("") }).strict();
export const academicProfileSaveSchema = z.object({ expectedRevision: z.number().int().nonnegative(), profile: academicProfileSchema }).strict();
const syllabus = z.object({
  summary: z.string().max(4000),
  approach: z.string().max(3000),
  schedule: z.string().max(1500),
  room: z.string().max(600),
  requirements: z.string().max(3000),
  bibliography: z.string().max(5000),
}).strict();
export type AcademicSyllabus = z.infer<typeof syllabus>;
export const emptyAcademicSyllabus: AcademicSyllabus = { summary: "", approach: "", schedule: "", room: "", requirements: "", bibliography: "" };
export const ACADEMIC_CALL_STATUS = { watching: "En seguimiento", preparing: "Preparando postulación", submitted: "Presentada", closed: "Cerrada" } as const;
const academicCall = z.object({
  country: z.string().refine(value => value === "" || isWorkCountry(value), "Selecciona un país válido"),
  organization: z.string().trim().max(200),
  url: z.string().trim().max(1000).refine(value => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch { return false; }
  }, "Usa un enlace oficial HTTPS"),
  deadline: z.string().refine(value => {
    if (!value) return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Usa una fecha de cierre válida"),
  status: z.enum(["watching", "preparing", "submitted", "closed"]),
}).strict();
export type AcademicCall = z.infer<typeof academicCall>;
export const emptyAcademicCall: AcademicCall = { country: "", organization: "", url: "", deadline: "", status: "watching" };
const brief = z.object({ objective: z.string().max(8000).default(""), audience: z.string().max(1000).default(""), language: z.string().max(80).default("Español"), duration: z.string().max(100).default(""), learningOutcomes: z.string().max(6000).default(""), evaluation: z.string().max(6000).default(""), task: academicModeSchema.default("literature_review"), syllabus: syllabus.optional(), call: academicCall.optional() }).strict();
const dimension = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/), label: z.string().trim().min(1).max(100), type: z.enum(["text", "number", "date", "tag"]) }).strict();
const cell = z.object({ value: z.string().max(5000), source: altazorSourceInputSchema.optional() }).strict();
const matrix = z.object({ dimensions: z.array(dimension).max(12), rows: z.array(z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), title: z.string().max(240), included: z.boolean(), cells: z.record(cell) }).strict()).max(100) }).strict().superRefine((value, ctx) => {
  const ids = new Set(value.dimensions.map(item => item.id));
  if (ids.size !== value.dimensions.length || new Set(value.rows.map(row => row.id)).size !== value.rows.length || value.rows.some(row => Object.keys(row.cells).some(key => !ids.has(key)))) ctx.addIssue({ code: "custom", message: "La matriz contiene filas o dimensiones repetidas o desconocidas" });
  for (const row of value.rows) for (const [id, entry] of Object.entries(row.cells)) {
    const type = value.dimensions.find(item => item.id === id)?.type;
    if (entry.value && (type === "number" && !/^-?\d+(?:[.,]\d+)?$/.test(entry.value) || type === "date" && (!/^\d{4}-\d{2}-\d{2}$/.test(entry.value) || Number.isNaN(Date.parse(entry.value))))) ctx.addIssue({ code: "custom", message: "Hay celdas cuyo valor no coincide con el tipo de dimensión" });
  }
});
export const academicWorkspaceCreateSchema = z.object({ requestId, title: z.string().trim().min(1).max(200), kind: z.enum(["research", "writing", "career", ...ACADEMIC_TEACHING_TEMPLATES]) }).strict();
export const academicWorkspaceSaveSchema = z.object({ expectedRevision: revision, title: z.string().trim().min(1).max(200), brief, matrix, sources: z.array(altazorSourceInputSchema).max(8).optional() }).strict();
export const academicPrepareSchema = z.object({ requestId, expectedRevision: revision, mode: academicModeSchema, instruction: z.string().trim().min(1).max(12000), sources: z.array(altazorSourceInputSchema).max(8), destinationKey: z.string().length(64), allowRemote: z.boolean().default(false) }).strict();
export const academicDraftCreateSchema = z.object({ requestId, expectedRevision: revision, template: z.enum(ACADEMIC_MANUSCRIPT_TEMPLATE_IDS) }).strict();
export const academicArtifactSaveSchema = z.object({ expectedRevision: revision, body: z.string().max(100000), reviewed: z.boolean() }).strict();
export const academicArtifactRestoreSchema = z.object({ expectedRevision: revision, revision }).strict();
export const emptyAcademicBrief: z.infer<typeof brief> = { objective: "", audience: "", language: "Español", duration: "", learningOutcomes: "", evaluation: "", task: "literature_review" };
export const emptyAcademicMatrix = { dimensions: [{ id: "question", label: "Pregunta y método", type: "text" as const }, { id: "finding", label: "Hallazgo", type: "text" as const }, { id: "limitations", label: "Límites", type: "text" as const }], rows: [] };
