import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(256),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(12).max(256),
});

export const causaCreateSchema = z.object({
  titulo: z.string().min(3),
  rit: z.string().optional().nullable(),
  ruc: z.string().optional().nullable(),
  tribunal: z.string().min(2),
  materia: z.string().min(2),
  procedimiento: z.string().optional().nullable(),
  estado: z.string().optional(),
  etapa: z.string().optional(),
  caratula: z.string().optional().nullable(),
  resumen: z.string().optional().nullable(),
  clienteId: z.string().optional().nullable(),
  abogadoId: z.string().optional().nullable(),
  sala: z.string().optional().nullable(),
  cuaderno: z.string().optional().nullable(),
  fechaNotificacion: z.string().optional().nullable(),
  abogadoContraparte: z.string().optional().nullable(),
  partes: z
    .array(
      z.object({
        nombre: z.string().min(2),
        rut: z.string().optional().nullable(),
        rol: z.string().min(2),
        domicilio: z.string().optional().nullable(),
      })
    )
    .optional(),
  conflictOverride: z.boolean().optional(),
  conflictNotes: z.string().optional().nullable(),
});

export const plazoCreateSchema = z.object({
  titulo: z.string().min(2),
  descripcion: z.string().optional().nullable(),
  fechaLimite: z.string().optional().nullable(),
  fechaNotificacion: z.string().optional().nullable(),
  diasPlazo: z.number().int().positive().optional().nullable(),
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
  autorId: z.string().optional().nullable(),
  confidencial: z.boolean().optional(),
  privilegio: z.boolean().optional(),
  mimeType: z.string().max(150).optional().nullable(),
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
