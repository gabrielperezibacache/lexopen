import { z } from "zod";
import { prisma } from "@/lib/db";
import { writeAuditStrict } from "@/lib/audit";
import { renderMinutaMarkdown, formatLocalDate, isValidTipoMinuta } from "@/lib/minutas";
import { storeUndo, consumeUndo } from "@/lib/assistant/plan-store";
import type { AssistantTool } from "./types";

const STAFF_ROLES = ["admin", "abogado", "asistente"] as const;

export const minutaBorradorSchema = z.object({
  causaId: z.string().min(1),
  tipo: z.string().trim().max(40).default("reunion"),
  titulo: z.string().trim().min(1).max(200),
  resumenEjecutivo: z.string().trim().min(1).max(50_000),
  hechosRelevantes: z.string().trim().max(20_000).optional(),
  acuerdos: z.string().trim().max(20_000).optional(),
  proximosPasos: z.string().trim().max(20_000).optional(),
  riesgosAlertas: z.string().trim().max(20_000).optional(),
});
export type MinutaBorradorInput = z.infer<typeof minutaBorradorSchema>;

/** Genera el Markdown de la minuta sin persistir (solo lectura/preview). */
export const minutaBorradorTool: AssistantTool<MinutaBorradorInput> = {
  id: "minuta.borrador",
  description: "Redacta un borrador de minuta (Markdown) sin guardarlo",
  kind: "read",
  roles: [...STAFF_ROLES],
  inputSchema: minutaBorradorSchema,
  preview(input) {
    return `Redactar borrador de minuta "${input.titulo}" para la causa ${input.causaId} (no se guarda hasta confirmar con minuta.crear).`;
  },
  async execute(input, ctx) {
    const causa = await prisma.causa.findUnique({
      where: { id: input.causaId },
      select: { id: true, titulo: true, rit: true, tribunal: true, etapa: true, caratula: true },
    });
    if (!causa) return { ok: false, message: "Causa no encontrada." };
    const user = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { name: true } });

    const markdown = renderMinutaMarkdown({
      tipo: isValidTipoMinuta(input.tipo) ? input.tipo : "reunion",
      titulo: input.titulo,
      fecha: new Date(),
      resumenEjecutivo: input.resumenEjecutivo,
      hechosRelevantes: input.hechosRelevantes,
      acuerdos: input.acuerdos,
      proximosPasos: input.proximosPasos,
      riesgosAlertas: input.riesgosAlertas,
      causa,
      autorName: user?.name,
    });
    return {
      ok: true,
      message: `Borrador de minuta "${input.titulo}" generado. Revíselo y use "guardar minuta" para persistirlo (BORRADOR, requiere revisión humana).`,
      card: { type: "minuta-borrador", causaId: causa.id, titulo: input.titulo, markdown },
    };
  },
};

export const minutaCrearSchema = z.object({
  causaId: z.string().min(1),
  tipo: z.string().trim().max(40).default("reunion"),
  titulo: z.string().trim().min(1).max(200),
  resumenEjecutivo: z.string().trim().min(1).max(50_000),
  hechosRelevantes: z.string().trim().max(20_000).optional(),
  acuerdos: z.string().trim().max(20_000).optional(),
  proximosPasos: z.string().trim().max(20_000).optional(),
  riesgosAlertas: z.string().trim().max(20_000).optional(),
  modalidad: z.string().trim().max(40).optional(),
  lugar: z.string().trim().max(300).optional(),
});
export type MinutaCrearInput = z.infer<typeof minutaCrearSchema>;

export const minutaCrearTool: AssistantTool<MinutaCrearInput> = {
  id: "minuta.crear",
  description: "Guarda una minuta (y su documento Markdown) en una causa",
  kind: "write",
  roles: [...STAFF_ROLES],
  inputSchema: minutaCrearSchema,
  preview(input) {
    return `Guardar minuta "${input.titulo}" en la causa ${input.causaId} — BORRADOR generado por el asistente, requiere revisión humana.`;
  },
  async execute(input, ctx) {
    const causa = await prisma.causa.findUnique({
      where: { id: input.causaId },
      select: { id: true, titulo: true, rit: true, tribunal: true, etapa: true, caratula: true },
    });
    if (!causa) return { ok: false, message: "Causa no encontrada." };
    const user = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { name: true } });
    const tipo = isValidTipoMinuta(input.tipo) ? input.tipo : "reunion";
    const fecha = new Date();

    const markdown = renderMinutaMarkdown({
      tipo,
      titulo: input.titulo,
      fecha,
      modalidad: input.modalidad,
      lugar: input.lugar,
      resumenEjecutivo: input.resumenEjecutivo,
      hechosRelevantes: input.hechosRelevantes,
      acuerdos: input.acuerdos,
      proximosPasos: input.proximosPasos,
      riesgosAlertas: input.riesgosAlertas,
      causa,
      autorName: user?.name,
    });
    const nombreDoc = `Minuta ${tipo} — ${input.titulo} — ${formatLocalDate(fecha)}.md`;

    const minuta = await prisma.$transaction(async (tx) => {
      const documento = await tx.documento.create({
        data: {
          nombre: nombreDoc,
          tipo: "minuta",
          mimeType: "text/markdown",
          contenido: markdown,
          causaId: causa.id,
          autorId: ctx.userId,
        },
      });
      return tx.minuta.create({
        data: {
          tipo,
          titulo: input.titulo,
          fecha,
          modalidad: input.modalidad || "presencial",
          lugar: input.lugar || null,
          participantes: "",
          resumenEjecutivo: input.resumenEjecutivo,
          hechosRelevantes: input.hechosRelevantes || null,
          acuerdos: input.acuerdos || null,
          proximosPasos: input.proximosPasos || null,
          riesgosAlertas: input.riesgosAlertas || "Generado por el asistente LexOpen. Requiere revisión humana antes de presentación o comunicación al cliente.",
          causaId: causa.id,
          autorId: ctx.userId,
          documentoId: documento.id,
        },
      });
    });

    await writeAuditStrict({
      actorId: ctx.userId,
      action: "minuta.create",
      entityType: "Minuta",
      entityId: minuta.id,
      after: { from: "assistant", causaId: causa.id, titulo: minuta.titulo },
    });
    const undoToken = await storeUndo({
      toolId: "minuta.crear",
      entityType: "Minuta",
      entityId: minuta.id,
    });
    return {
      ok: true,
      message: `Minuta "${minuta.titulo}" guardada en "${causa.titulo}" (BORRADOR, requiere revisión humana).`,
      entityId: minuta.id,
      undoToken,
      card: {
        type: "minuta",
        id: minuta.id,
        titulo: minuta.titulo,
        causaId: causa.id,
        href: `/causas/${causa.id}/minutas/${minuta.id}`,
      },
    };
  },
  async undo(token, ctx) {
    const payload = await consumeUndo(token);
    if (!payload || payload.toolId !== "minuta.crear") {
      return { ok: false, message: "Token de deshacer inválido o vencido." };
    }
    const minuta = await prisma.minuta.findUnique({ where: { id: payload.entityId } });
    if (!minuta) return { ok: false, message: "La minuta ya no existe." };
    await prisma.$transaction(async (tx) => {
      await tx.minuta.delete({ where: { id: minuta.id } });
      if (minuta.documentoId) {
        await tx.documento.delete({ where: { id: minuta.documentoId } }).catch(() => null);
      }
    });
    await writeAuditStrict({
      actorId: ctx.userId,
      action: "minuta.delete",
      entityType: "Minuta",
      entityId: minuta.id,
      before: minuta,
    });
    return { ok: true, message: `Se deshizo la creación de la minuta "${minuta.titulo}".` };
  },
};
