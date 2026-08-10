import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
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
  nombre: z.string().min(1),
  tipo: z.string().optional(),
  contenido: z.string().optional().nullable(),
  causaId: z.string().optional().nullable(),
  clienteId: z.string().optional().nullable(),
  autorId: z.string().optional().nullable(),
  confidencial: z.boolean().optional(),
  privilegio: z.boolean().optional(),
  mimeType: z.string().optional().nullable(),
  storageKey: z.string().optional().nullable(),
});

export const documentoUpdateSchema = z.object({
  nombre: z.string().min(1).optional(),
  tipo: z.string().min(1).optional(),
  confidencial: z.boolean().optional(),
  privilegio: z.boolean().optional(),
});

export const clienteCreateSchema = z.object({
  razonSocial: z.string().min(2),
  rut: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  telefono: z.string().optional().nullable(),
  tipo: z.enum(["persona", "empresa"]).optional(),
  estado: z.enum(["activo", "inactivo"]).optional(),
  notas: z.string().optional().nullable(),
  abogadoId: z.string().optional().nullable(),
});

export const clienteUpdateSchema = clienteCreateSchema.partial();

export const tramiteCreateSchema = z.object({
  titulo: z.string().min(2),
  detalle: z.string().optional().nullable(),
  estado: z.enum(["pendiente", "en_curso", "hecho", "cancelado"]).optional(),
  fechaLimite: z.string().optional().nullable(),
  responsableId: z.string().optional().nullable(),
  orden: z.number().int().optional(),
});

export const tramiteUpdateSchema = z.object({
  titulo: z.string().min(2).optional(),
  detalle: z.string().optional().nullable(),
  estado: z.enum(["pendiente", "en_curso", "hecho", "cancelado"]).optional(),
  fechaLimite: z.string().optional().nullable(),
  fechaHecho: z.string().optional().nullable(),
  responsableId: z.string().optional().nullable(),
  orden: z.number().int().optional(),
});

export const llmConfigSchema = z.object({
  preset: z
    .enum(["openai", "azure", "groq", "ollama", "hermes", "custom"])
    .optional(),
  apiUrl: z.string().min(1).optional(),
  apiKey: z.string().optional().nullable(),
  model: z.string().min(1).optional(),
  requireApproval: z.boolean().optional(),
  allowDemo: z.boolean().optional(),
});

export const invoiceCreateSchema = z.object({
  clienteId: z.string().min(1),
  causaId: z.string().optional().nullable(),
  tipoDocumento: z.string().optional(),
  status: z.string().optional(),
  number: z.string().optional().nullable(),
  issueDate: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  glosa: z.string().optional().nullable(),
  timeEntryIds: z.array(z.string()).optional(),
  expenseIds: z.array(z.string()).optional(),
  lines: z
    .array(
      z.object({
        description: z.string().min(1),
        quantity: z.coerce.number().positive().optional(),
        unitAmountClp: z.coerce.number().int(),
        tipo: z.string().optional(),
      })
    )
    .optional(),
});

export const paymentCreateSchema = z.object({
  clienteId: z.string().min(1),
  invoiceId: z.string().optional().nullable(),
  date: z.string().optional().nullable(),
  amountClp: z.coerce.number().int().positive(),
  method: z.string().optional(),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
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
