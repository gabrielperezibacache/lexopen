import { z } from "zod";
import { parseDateInput } from "@/lib/date-input";

const date = z.string().trim().max(80).refine(value => parseDateInput(value) !== null, "Fecha inválida");
const fields = {
  titulo: z.string().trim().min(1).max(200),
  tipo: z.enum(["audiencia", "reunion", "recordatorio", "vencimiento", "otro"]),
  inicio: date, fin: date.nullable(), todoElDia: z.boolean(),
  lugar: z.string().trim().max(300).nullable(),
  modalidad: z.enum(["presencial", "videollamada", "telefonica", "hibrida", "tribunal"]).nullable(),
  enlace: z.string().trim().max(2000).nullable(), notas: z.string().trim().max(5000).nullable(),
  tipoAudiencia: z.string().trim().max(120).nullable(), tribunal: z.string().trim().max(300).nullable(),
  causaId: z.string().min(1).max(100).nullable(), clienteId: z.string().min(1).max(100).nullable(),
  responsableId: z.string().min(1).max(100),
};
export const eventoCreateSchema = z.object(fields).partial().required({ titulo: true, inicio: true });
export const eventoUpdateSchema = z.object(fields).partial().extend({
  estado: z.enum(["programado", "cancelado", "realizado"]).optional(),
  expectedUpdatedAt: z.string().datetime().optional(),
});

/** All-day values use UTC midnight as a civil-date marker and an exclusive end. */
export function eventDate(value: string, allDay: boolean): Date {
  if (!parseDateInput(value)) throw new RangeError("Fecha inválida");
  return new Date(allDay ? `${value.slice(0, 10)}T00:00:00.000Z` : value);
}
export function validEventEnd(start: Date, end: Date | null) {
  return end === null || end.getTime() > start.getTime();
}
