import { z } from "zod";
import { isValidYmd, santiagoDateKey } from "@/lib/chile-time";

export const FISCALIA_PORTAL = "https://agenda.minpublico.cl/app/fiscalia-en-linea/#/login";
export const FISCALIA_HELP = "https://www.fiscaliadechile.cl/preguntas-frecuentes";
export const FISCALIA_STATUSES = { draft: "Borrador", ready: "Lista para presentar", submitted: "Enviada · registro manual", answered: "Respuesta registrada", closed: "Cerrada", cancelled: "Descartada" } as const;
export const FISCALIA_KINDS = { informacion: "Información de la causa", diligencia: "Diligencia de investigación", copia: "Copia de documentos", antecedentes: "Aporte de antecedentes", reapertura: "Reapertura con nuevos antecedentes", proteccion: "Medidas de protección", acreditacion: "Acreditación de representación", otro: "Otra solicitud" } as const;
const date = z.string().refine(isValidYmd, "Fecha no válida").nullable().default(null);
export const fiscaliaFields = z.strictObject({
  causaId: z.string().min(1).max(120), title: z.string().trim().min(3).max(300),
  kind: z.enum(Object.keys(FISCALIA_KINDS) as [keyof typeof FISCALIA_KINDS, ...(keyof typeof FISCALIA_KINDS)[]]),
  body: z.string().trim().max(20000).default(""), ruc: z.string().trim().max(40).nullable().default(null),
  status: z.enum(Object.keys(FISCALIA_STATUSES) as [keyof typeof FISCALIA_STATUSES, ...(keyof typeof FISCALIA_STATUSES)[]]).default("draft"),
  folio: z.string().trim().max(120).nullable().default(null), submittedAt: date,
  responseText: z.string().trim().max(20000).default(""), answeredAt: date, followUpDate: date,
  portalConfirmed: z.boolean().default(false),
});
export const fiscaliaUpdate = fiscaliaFields.extend({ id: z.string().min(1).max(120), expectedUpdatedAt: z.iso.datetime() });
export type FiscaliaInput = z.infer<typeof fiscaliaFields>;
export type FiscaliaState = keyof typeof FISCALIA_STATUSES;
const transitions: Record<FiscaliaState, readonly FiscaliaState[]> = {
  draft: ["draft", "ready", "cancelled"], ready: ["draft", "ready", "submitted", "cancelled"],
  submitted: ["submitted", "answered", "closed"], answered: ["answered", "closed"], closed: ["closed"], cancelled: ["cancelled"],
};
/** All dates/statuses are declared by a person; no guessed legal response deadline. */
export function fiscaliaValidation(input: FiscaliaInput, before: FiscaliaState | null, now = new Date()): string | null {
  if (!(before ? transitions[before] : ["draft", "ready"]).includes(input.status)) return "El cambio de estado no está permitido. Prepare la solicitud antes de registrar su presentación.";
  if (!["draft", "cancelled"].includes(input.status) && input.body.length < 10) return "Complete el contenido de la solicitud antes de prepararla.";
  if ((input.responseText || input.answeredAt) && !["answered", "closed"].includes(input.status)) return "Registre primero la presentación y seleccione el estado de respuesta recibida.";
  if (input.responseText && !input.answeredAt) return "Indique la fecha de la respuesta recibida.";
  if (["submitted", "answered", "closed"].includes(input.status)) {
    if (!input.folio || !input.submittedAt) return "Registre el folio y la fecha del comprobante oficial de presentación.";
    if ((before === "ready" || !before) && !input.portalConfirmed) return "Confirme que la solicitud se presentó en el portal oficial.";
    if (input.submittedAt > santiagoDateKey(now)) return "La presentación no puede tener una fecha futura.";
    if (input.followUpDate && input.followUpDate < input.submittedAt) return "El seguimiento no puede ser anterior a la presentación.";
  }
  if (input.status === "answered" && (!input.responseText || !input.answeredAt)) return "Registre la respuesta y su fecha.";
  if (input.answeredAt && (!input.submittedAt || input.answeredAt < input.submittedAt || input.answeredAt > santiagoDateKey(now))) return "Compruebe la fecha de respuesta respecto de la presentación y de hoy.";
  return null;
}
