import { z } from "zod";
import { prisma } from "@/lib/db";
import { writeAuditStrict } from "@/lib/audit";
import { civilDateKey, isValidYmd, ymdToLocalNoon } from "@/lib/chile-time";
import { calcularVencimiento } from "@/lib/plazos";
import { formatPlazoEstimate } from "@/lib/ai/local-assist";
import { storeUndo, consumeUndo } from "@/lib/assistant/plan-store";
import type { AssistantTool } from "./types";

const STAFF_ROLES = ["admin", "abogado", "asistente"] as const;

export const plazoCrearSchema = z.object({
  titulo: z.string().trim().min(2).max(200),
  descripcion: z.string().trim().max(5000).optional(),
  causaId: z.string().optional(),
  fechaLimite: z.string().trim().max(10).optional(),
  fechaNotificacion: z.string().trim().max(10).optional(),
  diasPlazo: z.number().int().positive().max(3650).optional(),
  tipoComputo: z.enum(["habiles", "corridos"]).optional(),
  esFatal: z.boolean().optional(),
  responsableId: z.string().optional(),
});
export type PlazoCrearInput = z.infer<typeof plazoCrearSchema>;

function resolveFechaLimite(input: PlazoCrearInput): Date | null {
  if (input.fechaLimite && isValidYmd(input.fechaLimite)) {
    return ymdToLocalNoon(input.fechaLimite);
  }
  if (input.diasPlazo) {
    const desde =
      input.fechaNotificacion && isValidYmd(input.fechaNotificacion)
        ? ymdToLocalNoon(input.fechaNotificacion)
        : new Date();
    return calcularVencimiento({
      desde,
      dias: input.diasPlazo,
      tipoComputo: input.tipoComputo || "habiles",
    });
  }
  return null;
}

export const plazoCrearTool: AssistantTool<PlazoCrearInput> = {
  id: "plazo.crear",
  description: "Crea un plazo (fecha límite calculada o explícita)",
  kind: "write",
  roles: [...STAFF_ROLES],
  inputSchema: plazoCrearSchema,
  preview(input) {
    const fecha = resolveFechaLimite(input);
    if (!fecha) return `Crear plazo "${input.titulo}" — indique fechaLimite o diasPlazo.`;
    return `Crear plazo "${input.titulo}"${
      input.esFatal ? " (FATAL)" : ""
    } con vencimiento ${civilDateKey(fecha)}. Estimación interna LexOpen, no es cómputo oficial del tribunal.`;
  },
  async execute(input, ctx) {
    const fechaLimite = resolveFechaLimite(input);
    if (!fechaLimite) {
      return { ok: false, message: "Indique fechaLimite o diasPlazo para calcular el vencimiento." };
    }
    const plazo = await prisma.plazo.create({
      data: {
        titulo: input.titulo,
        descripcion: input.descripcion || null,
        fechaLimite,
        fechaNotificacion:
          input.fechaNotificacion && isValidYmd(input.fechaNotificacion)
            ? ymdToLocalNoon(input.fechaNotificacion)
            : null,
        diasPlazo: input.diasPlazo || null,
        tipoComputo: input.tipoComputo || "habiles",
        esFatal: Boolean(input.esFatal),
        tipo: "procesal",
        estado: "pendiente",
        causaId: input.causaId || null,
        responsableId: input.responsableId || ctx.userId,
      },
    });
    if (plazo.causaId) {
      await prisma.activity.create({
        data: {
          tipo: "plazo",
          mensaje: `Plazo${plazo.esFatal ? " fatal" : ""}: ${plazo.titulo} (${civilDateKey(plazo.fechaLimite)})`,
          causaId: plazo.causaId,
          userId: ctx.userId,
        },
      });
    }
    await writeAuditStrict({
      actorId: ctx.userId,
      action: "plazo.create",
      entityType: "Plazo",
      entityId: plazo.id,
      after: plazo,
    });
    const undoToken = await storeUndo({
      toolId: "plazo.crear",
      entityType: "Plazo",
      entityId: plazo.id,
    });
    return {
      ok: true,
      message: `Plazo "${plazo.titulo}" creado, vence el ${civilDateKey(plazo.fechaLimite)}.`,
      entityId: plazo.id,
      undoToken,
      card: {
        type: "plazo",
        id: plazo.id,
        titulo: plazo.titulo,
        fechaLimite: plazo.fechaLimite,
        esFatal: plazo.esFatal,
      },
    };
  },
  async undo(token, ctx) {
    const payload = await consumeUndo(token);
    if (!payload || payload.toolId !== "plazo.crear") {
      return { ok: false, message: "Token de deshacer inválido o vencido." };
    }
    const plazo = await prisma.plazo.findUnique({ where: { id: payload.entityId } });
    if (!plazo) return { ok: false, message: "El plazo ya no existe." };
    await prisma.plazo.delete({ where: { id: plazo.id } });
    await writeAuditStrict({
      actorId: ctx.userId,
      action: "plazo.delete",
      entityType: "Plazo",
      entityId: plazo.id,
      before: plazo,
    });
    return { ok: true, message: `Se deshizo la creación del plazo "${plazo.titulo}".` };
  },
};

export const plazoEstimarSchema = z.object({
  desde: z.string().trim().min(1).max(10),
  dias: z.number().int().positive().max(3650),
  tipoComputo: z.enum(["habiles", "corridos"]).optional(),
});
export type PlazoEstimarInput = z.infer<typeof plazoEstimarSchema>;

export const plazoEstimarTool: AssistantTool<PlazoEstimarInput> = {
  id: "plazo.estimar",
  description: "Estima un vencimiento (días hábiles o corridos) sin persistir nada",
  kind: "read",
  roles: [...STAFF_ROLES],
  inputSchema: plazoEstimarSchema,
  preview(input) {
    const estimate = formatPlazoEstimate({
      desde: input.desde,
      dias: input.dias,
      tipoComputo: input.tipoComputo,
    });
    if ("error" in estimate) return `Estimar plazo: ${estimate.error}.`;
    const tipo = input.tipoComputo || "habiles";
    const pasos =
      tipo === "habiles"
        ? `Desde ${input.desde}, se cuentan ${input.dias} día(s) hábil(es) (lun–vie, sin feriados nacionales) sin contar el día de inicio.`
        : `Desde ${input.desde}, se cuentan ${input.dias} día(s) corrido(s); si el vencimiento cae en fin de semana o feriado, se corre al día hábil siguiente.`;
    return `${pasos} Resultado: vence el ${estimate.vencimiento} (${estimate.urgenciaLabel}). ⚠ Estimación interna LexOpen: no reemplaza el cómputo oficial del tribunal ni el criterio del abogado.`;
  },
  async execute(input) {
    const estimate = formatPlazoEstimate({
      desde: input.desde,
      dias: input.dias,
      tipoComputo: input.tipoComputo,
    });
    if ("error" in estimate) {
      return { ok: false, message: String(estimate.error) };
    }
    return {
      ok: true,
      message: `Vencimiento estimado: ${estimate.vencimiento} (${estimate.urgenciaLabel}). ${estimate.disclaimer}`,
      card: { type: "plazo-estimacion", ...estimate },
    };
  },
};