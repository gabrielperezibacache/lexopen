import { z } from "zod";
import { parseDateInput } from "@/lib/date-input";
import { MAX_DIAS_PLAZO } from "@/lib/plazos";

export const loginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(256),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(12).max(256),
});

const caseIdentifierSchema = z.string().max(80).regex(/^[^\p{Cc}\p{Zl}\p{Zp}]*$/u, "La referencia o identificación debe estar en una sola línea sin caracteres de control");

export const causaCreateSchema = z.object({
  titulo: z.string().min(3).max(500),
  rit: caseIdentifierSchema.optional().nullable(),
  ruc: caseIdentifierSchema.optional().nullable(),
  tribunal: z.string().min(2).max(300),
  materia: z.string().min(2).max(120),
  procedimiento: z.string().max(200).optional().nullable(),
  estado: z.string().min(2).max(40).optional(),
  etapa: z.string().min(2).max(40).optional(),
  caratula: z.string().max(500).optional().nullable(),
  resumen: z.string().max(20000).optional().nullable(),
  clienteId: z.string().max(100).optional().nullable(),
  abogadoId: z.string().max(100).optional().nullable(),
  sala: z.string().max(120).optional().nullable(),
  cuaderno: z.string().max(120).optional().nullable(),
  fechaNotificacion: z.string().max(40).optional().nullable(),
  abogadoContraparte: z.string().max(300).optional().nullable(),
  partes: z
    .array(
      z.object({
        nombre: z.string().min(2).max(300),
        rut: z.string().optional().nullable(),
        rol: z.string().min(2).max(80),
        domicilio: z.string().max(1000).optional().nullable(),
      })
    )
    .optional(),
  conflictOverride: z.boolean().optional(),
  conflictNotes: z.string().max(20000).optional().nullable(),
});

/** Partial update for ficha fields (no Drive — use Google integration routes). */
export const causaUpdateSchema = z
  .object({
    expectedUpdatedAt: z.string().datetime().optional(),
    titulo: z.string().min(3).max(500).optional(),
    rit: caseIdentifierSchema.optional().nullable(),
    ruc: caseIdentifierSchema.optional().nullable(),
    tribunal: z.string().min(2).max(300).optional(),
    materia: z.string().min(2).max(120).optional(),
    procedimiento: z.string().max(200).optional().nullable(),
    estado: z.string().min(2).max(40).optional(),
    etapa: z.string().min(2).max(40).optional(),
    caratula: z.string().max(500).optional().nullable(),
    resumen: z.string().max(20_000).optional().nullable(),
    clienteId: z.string().min(1).max(100).optional().nullable(),
    abogadoId: z.string().min(1).max(100).optional().nullable(),
    sala: z.string().max(120).optional().nullable(),
    cuaderno: z.string().max(120).optional().nullable(),
    abogadoContraparte: z.string().max(300).optional().nullable(),
    acceso: z.enum(["estudio", "equipo"]).optional(),
  })
  .refine((obj) => Object.keys(obj).some(key => key !== "expectedUpdatedAt"), {
    message: "Sin campos para actualizar",
  });

const deadlineDateInput = z.string().trim().max(80).refine(value => !value || parseDateInput(value) !== null, "Fecha inválida");
export const plazoCreateSchema = z.object({
  titulo: z.string().trim().min(2).max(300),
  descripcion: z.string().max(10000).optional().nullable(),
  fechaLimite: deadlineDateInput.optional().nullable(),
  fechaNotificacion: deadlineDateInput.optional().nullable(),
  diasPlazo: z.number().int().positive().max(MAX_DIAS_PLAZO).optional().nullable(),
  tipoComputo: z.enum(["habiles", "corridos"]).optional(),
  esFatal: z.boolean().optional(),
  tipo: z.string().optional(),
  causaId: z.string().optional().nullable(),
  responsableId: z.string().optional().nullable(),
});

export const documentoCreateSchema = z.object({
  nombre: z.string().min(1).max(255),
  tipo: z.string().max(80).optional(),
  contenido: z.string().max(25 * 1024 * 1024).optional().nullable(),
  causaId: z.string().optional().nullable(),
  clienteId: z.string().optional().nullable(),
  autorId: z.string().optional().nullable(),
  confidencial: z.boolean().optional(),
  privilegio: z.boolean().optional(),
  mimeType: z.string().max(150).optional().nullable(),
  /** Relative folder path inside an investigative folder (no filename). */
  ruta: z.string().max(1000).optional().nullable(),
});

export const documentoUpdateSchema = z.object({
  expectedVersion: z.number().int().positive().optional(),
  nombre: z.string().min(1).max(255).optional(),
  tipo: z.string().min(1).max(80).optional(),
  confidencial: z.boolean().optional(),
  privilegio: z.boolean().optional(),
});

export const clienteCreateSchema = z.object({
  razonSocial: z.string().min(2).max(300),
  rut: z.string().max(32).optional().nullable(),
  email: z.string().email().max(320).optional().nullable().or(z.literal("")),
  telefono: z.string().max(60).optional().nullable(),
  tipo: z.enum(["persona", "empresa"]).optional(),
  estado: z.enum(["activo", "inactivo"]).optional(),
  notas: z.string().max(10000).optional().nullable(),
  abogadoId: z.string().optional().nullable(),
});

export const clienteUpdateSchema = clienteCreateSchema.partial();

export const tramiteCreateSchema = z.object({
  titulo: z.string().min(2).max(300),
  detalle: z.string().max(10000).optional().nullable(),
  estado: z.enum(["pendiente", "en_curso", "hecho", "cancelado"]).optional(),
  fechaLimite: z.string().optional().nullable(),
  responsableId: z.string().optional().nullable(),
  orden: z.number().int().optional(),
});

export const tramiteUpdateSchema = z.object({
  expectedUpdatedAt: z.string().datetime().optional(),
  titulo: z.string().min(2).max(300).optional(),
  detalle: z.string().max(10000).optional().nullable(),
  estado: z.enum(["pendiente", "en_curso", "hecho", "cancelado"]).optional(),
  fechaLimite: z.string().optional().nullable(),
  fechaHecho: z.string().optional().nullable(),
  responsableId: z.string().optional().nullable(),
  orden: z.number().int().optional(),
});

const billingDate = z
  .string()
  .max(64)
  .refine((value) => !Number.isNaN(Date.parse(value)), "Fecha inválida");

export const invoiceCreateSchema = z.object({
  clienteId: z.string().min(1),
  causaId: z.string().optional().nullable(),
  tipoDocumento: z
    .enum(["boleta_honorarios", "factura_afecta", "factura_exenta", "nota_credito"])
    .optional(),
  status: z.enum(["borrador", "emitida"]).optional(),
  number: z.string().trim().min(1).max(60).optional().nullable(),
  issueDate: billingDate.optional().nullable(),
  dueDate: billingDate.optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  glosa: z.string().max(5000).optional().nullable(),
  timeEntryIds: z.array(z.string()).max(100).optional(),
  expenseIds: z.array(z.string()).max(100).optional(),
  lines: z
    .array(
      z.object({
        description: z.string().min(1).max(500),
        quantity: z.coerce.number().positive().max(1_000_000).optional(),
        unitAmountClp: z.coerce.number().int().nonnegative().max(1_000_000_000),
        tipo: z.string().max(40).optional(),
      })
    )
    .max(100)
    .optional(),
});

export const invoiceUpdateSchema = z.object({
  status: z.enum(["emitida", "anulada"]).optional(),
  dueDate: billingDate.optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
}).strict();

export const paymentCreateSchema = z.object({
  clienteId: z.string().min(1),
  invoiceId: z.string().optional().nullable(),
  date: billingDate.optional().nullable(),
  amountClp: z.coerce.number().int().positive().max(1_000_000_000),
  method: z
    .enum(["transferencia", "cheque", "efectivo", "tarjeta", "retencion"])
    .optional(),
  reference: z.string().max(200).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

export const siteCreateSchema = z.object({
  name: z.string().min(1),
  slug: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  tipo: z.string().optional(),
  color: z.string().optional(),
  isClientVisible: z.boolean().optional(),
  clienteId: z.string().optional().nullable(),
  causaId: z.string().optional().nullable(),
});

export const siteUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  tipo: z.string().optional(),
  status: z.enum(["active", "archived"]).optional(),
  color: z.string().optional(),
  isClientVisible: z.boolean().optional(),
  clienteId: z.string().optional().nullable(),
  causaId: z.string().optional().nullable(),
});

export const ledgerCreateSchema = z.object({
  clienteId: z.string().min(1),
  causaId: z.string().optional().nullable(),
  invoiceId: z.string().optional().nullable(),
  paymentId: z.string().optional().nullable(),
  date: z.string().optional().nullable(),
  tipo: z.string().optional(),
  description: z.string().min(1),
  debitClp: z.coerce.number().int().nonnegative().optional(),
  creditClp: z.coerce.number().int().nonnegative().optional(),
});

export const timeEntrySchema = z.object({
  id: z.string().optional(),
  date: z.string().optional().nullable(),
  hours: z.coerce.number().nonnegative().optional(),
  description: z.string().min(1),
  billable: z.boolean().optional(),
  rateClp: z.coerce.number().int().nonnegative().optional().nullable(),
  amountClp: z.coerce.number().int().nonnegative().optional(),
  activityCode: z.string().optional(),
  userId: z.string().optional().nullable(),
  clienteId: z.string().optional().nullable(),
  causaId: z.string().optional().nullable(),
  timerStartedAt: z.string().optional().nullable(),
  timerStoppedAt: z.string().optional().nullable(),
  stoppedAt: z.string().optional().nullable(),
  stopTimer: z.boolean().optional(),
});

export const expenseCreateSchema = z.object({
  date: billingDate.optional().nullable(),
  description: z.string().min(1).max(500),
  category: z.string().max(80).optional(),
  amountClp: z.coerce.number().int().positive().max(1_000_000_000),
  billable: z.boolean().optional(),
  reimbursable: z.boolean().optional(),
  vendor: z.string().max(200).optional().nullable(),
  clienteId: z.string().optional().nullable(),
  causaId: z.string().optional().nullable(),
});

export const feeArrangementCreateSchema = z.object({
  name: z.string().min(1).max(200),
  tipo: z
    .enum(["hourly", "flat", "retainer", "cuota_litis", "mixed"])
    .optional(),
  currency: z.string().max(8).optional(),
  rateHourlyClp: z.coerce.number().int().nonnegative().max(1_000_000_000).optional().nullable(),
  rateHourlyUf: z.coerce.number().nonnegative().max(1_000_000).optional().nullable(),
  flatFeeClp: z.coerce.number().int().nonnegative().max(1_000_000_000).optional().nullable(),
  retainerClp: z.coerce.number().int().nonnegative().max(1_000_000_000).optional().nullable(),
  cuotaLitisPct: z.coerce.number().nonnegative().max(100).optional().nullable(),
  billingCapClp: z.coerce.number().int().nonnegative().max(1_000_000_000).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  clienteId: z.string().optional().nullable(),
  causaId: z.string().optional().nullable(),
});

export const llmConfigSchema = z.object({
  preset: z
    .enum(["openai", "azure", "groq", "ollama", "hermes", "custom"])
    .optional(),
  apiUrl: z
    .string()
    .min(1)
    .max(500)
    .optional()
    .refine(
      (value) => {
        if (value === undefined) return true;
        try {
          const url = new URL(value);
          return url.protocol === "http:" || url.protocol === "https:";
        } catch {
          return false;
        }
      },
      { message: "La URL del endpoint de IA debe ser http(s) válida" }
    ),
  apiKey: z.string().max(500).optional().nullable(),
  model: z.string().min(1).max(200).optional(),
  requireApproval: z.boolean().optional(),
  allowDemo: z.boolean().optional(),
});
