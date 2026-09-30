import { z } from "zod";
import { prisma } from "@/lib/db";
import { writeAuditStrict } from "@/lib/audit";
import { civilDateKey } from "@/lib/chile-time";
import { clasificarUrgencia, labelUrgencia } from "@/lib/plazos";
import { labelEstado, labelEtapa } from "@/lib/chile";
import { storeUndo, consumeUndo } from "@/lib/assistant/plan-store";
import type { AssistantTool } from "./types";

const STAFF_ROLES = ["admin", "abogado", "asistente"] as const;

export const causaVincularSchema = z.object({
  causaId: z.string().min(1),
  clienteId: z.string().optional().nullable(),
  abogadoId: z.string().optional().nullable(),
}).refine((o) => o.clienteId !== undefined || o.abogadoId !== undefined, {
  message: "Indique clienteId o abogadoId",
});
export type CausaVincularInput = z.infer<typeof causaVincularSchema>;

export const causaVincularTool: AssistantTool<CausaVincularInput> = {
  id: "causa.vincular",
  description: "Vincula una causa a un cliente y/o abogado responsable",
  kind: "write",
  roles: [...STAFF_ROLES],
  async preview(input) {
    const [causa, cliente, abogado] = await Promise.all([
      prisma.causa.findUnique({ where: { id: input.causaId }, select: { titulo: true } }),
      input.clienteId
        ? prisma.cliente.findUnique({ where: { id: input.clienteId }, select: { razonSocial: true } })
        : Promise.resolve(null),
      input.abogadoId
        ? prisma.user.findUnique({ where: { id: input.abogadoId }, select: { name: true } })
        : Promise.resolve(null),
    ]);
    const parts: string[] = [];
    if (cliente) parts.push(`cliente → ${cliente.razonSocial}`);
    if (abogado) parts.push(`abogado responsable → ${abogado.name}`);
    return `Vincular causa "${causa?.titulo || input.causaId}": ${parts.join(", ") || "sin cambios"}`;
  },
  inputSchema: causaVincularSchema,
  async execute(input, ctx) {
    const before = await prisma.causa.findUnique({ where: { id: input.causaId } });
    if (!before) return { ok: false, message: "Causa no encontrada." };
    const causa = await prisma.causa.update({
      where: { id: input.causaId },
      data: {
        ...(input.clienteId !== undefined ? { clienteId: input.clienteId || null } : {}),
        ...(input.abogadoId !== undefined ? { abogadoId: input.abogadoId || null } : {}),
      },
    });
    await writeAuditStrict({
      actorId: ctx.userId,
      action: "causa.vincular",
      entityType: "Causa",
      entityId: causa.id,
      before: { clienteId: before.clienteId, abogadoId: before.abogadoId },
      after: { clienteId: causa.clienteId, abogadoId: causa.abogadoId },
    });
    const undoToken = await storeUndo({
      toolId: "causa.vincular",
      entityType: "Causa",
      entityId: causa.id,
      before: { clienteId: before.clienteId, abogadoId: before.abogadoId },
    });
    return {
      ok: true,
      message: `Causa "${causa.titulo}" vinculada.`,
      entityId: causa.id,
      undoToken,
      card: { type: "causa", id: causa.id, titulo: causa.titulo, clienteId: causa.clienteId, abogadoId: causa.abogadoId },
    };
  },
  async undo(token, ctx) {
    const payload = await consumeUndo(token);
    if (!payload || payload.toolId !== "causa.vincular") {
      return { ok: false, message: "Token de deshacer inválido o vencido." };
    }
    const before = payload.before as { clienteId: string | null; abogadoId: string | null };
    const causa = await prisma.causa.update({ where: { id: payload.entityId }, data: before });
    await writeAuditStrict({
      actorId: ctx.userId,
      action: "causa.vincular",
      entityType: "Causa",
      entityId: causa.id,
      after: before,
    });
    return { ok: true, message: `Se restauró la vinculación de la causa "${causa.titulo}".` };
  },
};

export const causaBuscarSchema = z.object({
  q: z.string().trim().min(1).max(300),
});
export type CausaBuscarInput = z.infer<typeof causaBuscarSchema>;

export const causaBuscarTool: AssistantTool<CausaBuscarInput> = {
  id: "causa.buscar",
  description: "Busca causas por título, RIT, RUC, carátula o tribunal",
  kind: "read",
  roles: [...STAFF_ROLES],
  inputSchema: causaBuscarSchema,
  preview(input) {
    return `Buscar causas que coincidan con "${input.q}".`;
  },
  async execute(input) {
    const causas = await prisma.causa.findMany({
      where: {
        OR: [
          { titulo: { contains: input.q, mode: "insensitive" } },
          { rit: { contains: input.q, mode: "insensitive" } },
          { ruc: { contains: input.q, mode: "insensitive" } },
          { caratula: { contains: input.q, mode: "insensitive" } },
          { tribunal: { contains: input.q, mode: "insensitive" } },
        ],
      },
      select: { id: true, titulo: true, rit: true, tribunal: true, estado: true },
      orderBy: { updatedAt: "desc" },
      take: 20,
    });
    if (causas.length === 0) {
      return { ok: true, message: `No se encontraron causas para "${input.q}".` };
    }
    return {
      ok: true,
      message: `${causas.length} causa(s) encontrada(s) para "${input.q}".`,
      card: { type: "causa-lista", items: causas },
    };
  },
};

export const causaResumenSchema = z.object({
  causaId: z.string().min(1),
});
export type CausaResumenInput = z.infer<typeof causaResumenSchema>;

export const causaResumenTool: AssistantTool<CausaResumenInput> = {
  id: "causa.resumen",
  description: "Resume el estado actual de una causa (datos LexOpen, sin IA)",
  kind: "read",
  roles: [...STAFF_ROLES],
  inputSchema: causaResumenSchema,
  preview(input) {
    return `Resumir la causa ${input.causaId} (etapa, plazos y últimos movimientos).`;
  },
  async execute(input) {
    const causa = await prisma.causa.findUnique({
      where: { id: input.causaId },
      include: {
        plazos: { where: { estado: "pendiente" }, orderBy: { fechaLimite: "asc" }, take: 5 },
        movimientos: { orderBy: { fecha: "desc" }, take: 5 },
      },
    });
    if (!causa) return { ok: false, message: "Causa no encontrada." };

    const plazosLine = causa.plazos.length
      ? causa.plazos
          .map((p) => `${p.titulo} (${labelUrgencia(clasificarUrgencia(p.fechaLimite))})`)
          .join("; ")
      : "sin plazos pendientes";
    const movLine = causa.movimientos.length
      ? causa.movimientos.map((m) => m.titulo).join("; ")
      : "sin movimientos registrados";

    const message = `Causa "${causa.titulo}" — ${labelEstado(causa.estado)} / ${labelEtapa(causa.etapa)}. Plazos pendientes: ${plazosLine}. Últimos movimientos: ${movLine}.`;
    return {
      ok: true,
      message,
      card: {
        type: "causa-resumen",
        id: causa.id,
        titulo: causa.titulo,
        estado: causa.estado,
        etapa: causa.etapa,
        plazos: causa.plazos.map((p) => ({ id: p.id, titulo: p.titulo, fechaLimite: p.fechaLimite })),
        movimientos: causa.movimientos.map((m) => ({ id: m.id, titulo: m.titulo, fecha: m.fecha })),
      },
    };
  },
};

export const causaMovimientosSchema = z.object({
  causaId: z.string().min(1),
  limit: z.number().int().positive().max(50).optional(),
});
export type CausaMovimientosInput = z.infer<typeof causaMovimientosSchema>;

export const causaMovimientosTool: AssistantTool<CausaMovimientosInput> = {
  id: "causa.movimientos",
  description: "Lista los últimos movimientos registrados de una causa",
  kind: "read",
  roles: [...STAFF_ROLES],
  inputSchema: causaMovimientosSchema,
  preview(input) {
    return `Listar los últimos movimientos de la causa ${input.causaId}.`;
  },
  async execute(input) {
    const causa = await prisma.causa.findUnique({
      where: { id: input.causaId },
      select: { id: true, titulo: true },
    });
    if (!causa) return { ok: false, message: "Causa no encontrada." };
    const movimientos = await prisma.causaMovimiento.findMany({
      where: { causaId: input.causaId },
      orderBy: { fecha: "desc" },
      take: input.limit || 10,
    });
    const message = movimientos.length
      ? `${movimientos.length} movimiento(s) de "${causa.titulo}": ${movimientos
          .map((m) => `${civilDateKey(m.fecha)} — ${m.titulo}`)
          .join("; ")}`
      : `Sin movimientos registrados para "${causa.titulo}".`;
    return {
      ok: true,
      message,
      card: { type: "causa-movimientos", causaId: causa.id, items: movimientos },
    };
  },
};

export const causaEstadoSchema = z.object({
  causaId: z.string().min(1),
});
export type CausaEstadoInput = z.infer<typeof causaEstadoSchema>;

export const causaEstadoTool: AssistantTool<CausaEstadoInput> = {
  id: "causa.estado",
  description: "Consulta el estado/etapa procesal de una causa",
  kind: "read",
  roles: [...STAFF_ROLES],
  inputSchema: causaEstadoSchema,
  preview(input) {
    return `Consultar estado y etapa de la causa ${input.causaId}.`;
  },
  async execute(input) {
    const causa = await prisma.causa.findUnique({
      where: { id: input.causaId },
      select: { id: true, titulo: true, estado: true, etapa: true, rit: true },
    });
    if (!causa) return { ok: false, message: "Causa no encontrada." };
    return {
      ok: true,
      message: `Causa "${causa.titulo}" (${causa.rit || "sin RIT"}): estado ${labelEstado(
        causa.estado
      )}, etapa ${labelEtapa(causa.etapa)}.`,
      card: { type: "causa-estado", id: causa.id, titulo: causa.titulo, estado: causa.estado, etapa: causa.etapa },
    };
  },
};