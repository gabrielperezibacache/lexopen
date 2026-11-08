import { z } from "zod";
export const memoId = z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);
export const memoVersion = z.string().regex(/^[a-f0-9]{64}$/);
const civil = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
export const memoDate = z.string().max(80).refine(s => civil(s.slice(0, 10)) && (s.length === 10 || /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(s) && !Number.isNaN(Date.parse(s))), "Fecha inválida");
const text = (max = 20000) => z.string().max(max).nullable();
export const noteFieldsSchema = z.object({ titulo: z.string().trim().min(1).max(200), contenido: z.string().min(1).max(20000).refine(s => Boolean(s.trim()), "La nota no puede estar vacía"), tags: z.string().max(300) }).strict();
export const minuteActionSchema = z.object({ id: memoId, descripcion: z.string().trim().min(1).max(10000), responsable: text(300), fechaLimite: memoDate.nullable(),
  prioridad: z.enum(["baja", "media", "alta", "urgente"]), estado: z.enum(["pendiente", "en_curso", "hecha", "cancelada"]), crearTask: z.boolean(), crearPlazo: z.boolean(), tipoComputo: z.enum(["habiles", "corridos"]), esFatal: z.boolean(),
}).strict();
export const minuteFieldsSchema = z.object({
  tipo: z.enum(["audiencia", "reunion", "llamada"]), titulo: z.string().trim().min(1).max(300), fecha: memoDate,
  modalidad: z.enum(["presencial", "videollamada", "telefonica", "hibrida"]), lugar: text(300), participantes: z.string().max(3000), resumenEjecutivo: z.string().min(1).max(50000).refine(s => Boolean(s.trim()), "Indique el resumen ejecutivo"),
  hechosRelevantes: text(), acuerdos: text(), proximosPasos: text(), riesgosAlertas: text(), estadoCausaNota: text(), etapaSugerida: text(40), confidencial: z.boolean(),
  acciones: z.array(minuteActionSchema).max(50).refine(a => new Set(a.map(x => x.id)).size === a.length, "Cada acción necesita una identidad distinta"),
}).strict();
export type MinuteFields = z.infer<typeof minuteFieldsSchema>;
export type MinuteAction = z.infer<typeof minuteActionSchema>;
