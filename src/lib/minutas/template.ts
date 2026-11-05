import { z } from "zod";
export const minutaTemplateBodySchema = z.object({
  titulo: z.string().max(300).optional(), resumenEjecutivo: z.string().max(20000).optional(),
  hechosRelevantes: z.string().max(20000).optional(), acuerdos: z.string().max(20000).optional(),
  riesgosAlertas: z.string().max(20000).optional(), proximosPasos: z.array(z.string().max(2000)).max(100).optional(),
}).passthrough();
export function parseMinutaTemplate(body: string) {
  if (body.length > 60000) throw new Error("La plantilla es demasiado extensa. Reduce su contenido antes de guardarla.");
  try { return minutaTemplateBodySchema.parse(JSON.parse(body || "{}")); }
  catch { throw new Error("La plantilla no tiene un formato válido. Revisa sus campos o corrige el formato avanzado."); }
}
