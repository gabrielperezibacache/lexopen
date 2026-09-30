import { z } from "zod";
import { prisma } from "@/lib/db";
import { writeAuditStrict } from "@/lib/audit";
import { storeUndo, consumeUndo } from "@/lib/assistant/plan-store";
import type { AssistantTool } from "./types";

const STAFF_ROLES = ["admin", "abogado", "asistente"] as const;

export const notaCrearSchema = z.object({
  causaId: z.string().min(1, "Debe indicar la causa"),
  titulo: z.string().trim().min(1).max(200).default("Nota"),
  contenido: z
    .string()
    .trim()
    .min(1, "La nota no puede estar vacía")
    .max(20_000),
  tags: z.string().trim().max(300).optional(),
});
export type NotaCrearInput = z.infer<typeof notaCrearSchema>;

export const notaCrearTool: AssistantTool<NotaCrearInput> = {
  id: "nota.crear",
  description: "Crea una nota en una causa",
  kind: "write",
  roles: [...STAFF_ROLES],
  inputSchema: notaCrearSchema,
  async preview(input) {
    const causa = await prisma.causa.findUnique({
      where: { id: input.causaId },
      select: { titulo: true },
    });
    const resumen =
      input.contenido.length > 140
        ? `${input.contenido.slice(0, 140)}…`
        : input.contenido;
    return `Crear nota "${input.titulo}" en la causa ${
      causa?.titulo || input.causaId
    }: «${resumen}»`;
  },
  async execute(input, ctx) {
    const causa = await prisma.causa.findUnique({
      where: { id: input.causaId },
      select: { id: true, titulo: true },
    });
    if (!causa) return { ok: false, message: "Causa no encontrada." };

    const nota = await prisma.nota.create({
      data: {
        titulo: input.titulo,
        contenido: input.contenido,
        tags: input.tags || "",
        causaId: input.causaId,
      },
    });
    await prisma.activity.create({
      data: {
        tipo: "nota",
        mensaje: `Nota creada: ${nota.titulo}`,
        causaId: input.causaId,
        userId: ctx.userId,
      },
    });
    await writeAuditStrict({
      actorId: ctx.userId,
      action: "nota.create",
      entityType: "Nota",
      entityId: nota.id,
      after: nota,
    });
    const undoToken = await storeUndo({
      toolId: "nota.crear",
      entityType: "Nota",
      entityId: nota.id,
    });
    return {
      ok: true,
      message: `Nota "${nota.titulo}" creada en ${causa.titulo}.`,
      entityId: nota.id,
      undoToken,
      card: { type: "nota", id: nota.id, titulo: nota.titulo, causaId: causa.id },
    };
  },
  async undo(token, ctx) {
    const payload = await consumeUndo(token);
    if (!payload || payload.toolId !== "nota.crear") {
      return { ok: false, message: "Token de deshacer inválido o vencido." };
    }
    const nota = await prisma.nota.findUnique({ where: { id: payload.entityId } });
    if (!nota) return { ok: false, message: "La nota ya no existe." };
    await prisma.nota.delete({ where: { id: nota.id } });
    await writeAuditStrict({
      actorId: ctx.userId,
      action: "nota.delete",
      entityType: "Nota",
      entityId: nota.id,
      before: nota,
    });
    return { ok: true, message: `Se deshizo la creación de la nota "${nota.titulo}".` };
  },
};

export const notaEditarSchema = z
  .object({
    notaId: z.string().min(1),
    titulo: z.string().trim().max(200).optional(),
    contenido: z.string().trim().max(20_000).optional(),
    tags: z.string().trim().max(300).optional(),
  })
  .refine((o) => o.titulo !== undefined || o.contenido !== undefined || o.tags !== undefined, {
    message: "Indique al menos un campo a editar",
  });
export type NotaEditarInput = z.infer<typeof notaEditarSchema>;

export const notaEditarTool: AssistantTool<NotaEditarInput> = {
  id: "nota.editar",
  description: "Edita el título, contenido o tags de una nota existente",
  kind: "write",
  roles: [...STAFF_ROLES],
  inputSchema: notaEditarSchema,
  async preview(input) {
    const nota = await prisma.nota.findUnique({ where: { id: input.notaId } });
    if (!nota) return `Editar nota ${input.notaId} (no encontrada).`;
    const cambios: string[] = [];
    if (input.titulo !== undefined) cambios.push(`título → "${input.titulo}"`);
    if (input.contenido !== undefined) {
      cambios.push(`contenido → «${input.contenido.slice(0, 100)}…»`);
    }
    if (input.tags !== undefined) cambios.push(`tags → "${input.tags}"`);
    return `Editar nota "${nota.titulo}": ${cambios.join(", ")}`;
  },
  async execute(input, ctx) {
    const before = await prisma.nota.findUnique({ where: { id: input.notaId } });
    if (!before) return { ok: false, message: "Nota no encontrada." };

    const nota = await prisma.nota.update({
      where: { id: input.notaId },
      data: {
        ...(input.titulo !== undefined ? { titulo: input.titulo } : {}),
        ...(input.contenido !== undefined ? { contenido: input.contenido } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
      },
    });
    await writeAuditStrict({
      actorId: ctx.userId,
      action: "nota.update",
      entityType: "Nota",
      entityId: nota.id,
      before,
      after: nota,
    });
    const undoToken = await storeUndo({
      toolId: "nota.editar",
      entityType: "Nota",
      entityId: nota.id,
      before: {
        titulo: before.titulo,
        contenido: before.contenido,
        tags: before.tags,
      },
    });
    return {
      ok: true,
      message: `Nota "${nota.titulo}" actualizada.`,
      entityId: nota.id,
      undoToken,
      card: { type: "nota", id: nota.id, titulo: nota.titulo, causaId: nota.causaId },
    };
  },
  async undo(token, ctx) {
    const payload = await consumeUndo(token);
    if (!payload || payload.toolId !== "nota.editar") {
      return { ok: false, message: "Token de deshacer inválido o vencido." };
    }
    const before = payload.before as { titulo: string; contenido: string; tags: string };
    const nota = await prisma.nota.update({
      where: { id: payload.entityId },
      data: before,
    });
    await writeAuditStrict({
      actorId: ctx.userId,
      action: "nota.update",
      entityType: "Nota",
      entityId: nota.id,
      after: before,
    });
    return { ok: true, message: `Se restauró la nota "${nota.titulo}".` };
  },
};
