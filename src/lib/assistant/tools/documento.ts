import { z } from "zod";
import { prisma } from "@/lib/db";
import { confidentialWhere } from "@/lib/api";
import { writeAuditStrict } from "@/lib/audit";
import { askLlm, legalSystemPrompt } from "@/lib/integrations/llm";
import { inferDocumentoTipo } from "@/lib/document-ingest";
import { storeUndo, consumeUndo } from "@/lib/assistant/plan-store";
import type { AssistantTool } from "./types";

const STAFF_ROLES = ["admin", "abogado", "asistente"] as const;

export const documentoBuscarSchema = z.object({
  q: z.string().trim().min(1).max(300),
  causaId: z.string().optional(),
});
export type DocumentoBuscarInput = z.infer<typeof documentoBuscarSchema>;

export const documentoBuscarTool: AssistantTool<DocumentoBuscarInput> = {
  id: "documento.buscar",
  description: "Busca documentos por nombre o contenido indexado",
  kind: "read",
  roles: [...STAFF_ROLES],
  inputSchema: documentoBuscarSchema,
  preview(input) {
    return `Buscar documentos que coincidan con "${input.q}"${
      input.causaId ? ` en la causa ${input.causaId}` : ""
    }.`;
  },
  async execute(input, ctx) {
    const documentos = await prisma.documento.findMany({
      where: {
        ...(input.causaId ? { causaId: input.causaId } : {}),
        ...confidentialWhere(ctx.role),
        OR: [
          { nombre: { contains: input.q, mode: "insensitive" } },
          { extractedMarkdown: { contains: input.q, mode: "insensitive" } },
          { contenido: { contains: input.q, mode: "insensitive" } },
        ],
      },
      select: { id: true, nombre: true, tipo: true, causaId: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 20,
    });
    if (documentos.length === 0) {
      return { ok: true, message: `No se encontraron documentos para "${input.q}".` };
    }
    return {
      ok: true,
      message: `${documentos.length} documento(s) encontrado(s) para "${input.q}".`,
      card: { type: "documento-lista", items: documentos },
    };
  },
};

export const documentoDescargarSchema = z.object({
  documentoId: z.string().min(1),
});
export type DocumentoDescargarInput = z.infer<typeof documentoDescargarSchema>;

export const documentoDescargarTool: AssistantTool<DocumentoDescargarInput> = {
  id: "documento.descargar",
  description: "Obtiene el enlace de descarga de un documento",
  kind: "read",
  roles: [...STAFF_ROLES],
  inputSchema: documentoDescargarSchema,
  preview(input) {
    return `Obtener enlace de descarga del documento ${input.documentoId}.`;
  },
  async execute(input, ctx) {
    const doc = await prisma.documento.findFirst({
      where: { id: input.documentoId, ...confidentialWhere(ctx.role) },
      select: { id: true, nombre: true, mimeType: true },
    });
    if (!doc) return { ok: false, message: "Documento no encontrado o sin acceso." };
    return {
      ok: true,
      message: `Enlace de descarga listo para "${doc.nombre}".`,
      card: {
        type: "documento-descarga",
        id: doc.id,
        nombre: doc.nombre,
        href: `/api/documentos/${doc.id}/content`,
      },
    };
  },
};

export const documentoResumirSchema = z.object({
  documentoId: z.string().min(1),
});
export type DocumentoResumirInput = z.infer<typeof documentoResumirSchema>;

export const documentoResumirTool: AssistantTool<DocumentoResumirInput> = {
  id: "documento.resumir",
  description: "Resume un documento con el proveedor de IA configurado",
  kind: "read",
  roles: [...STAFF_ROLES],
  inputSchema: documentoResumirSchema,
  preview(input) {
    return `Resumir el documento ${input.documentoId} con IA (borrador, requiere revisión humana).`;
  },
  async execute(input, ctx) {
    const doc = await prisma.documento.findFirst({
      where: { id: input.documentoId, ...confidentialWhere(ctx.role) },
    });
    if (!doc) return { ok: false, message: "Documento no encontrado o sin acceso." };
    const texto = (doc.extractedMarkdown || doc.contenido || "").trim();
    if (!texto) {
      return {
        ok: false,
        message: `"${doc.nombre}" no tiene texto indexado aún (OCR/extracción pendiente).`,
      };
    }
    const result = await askLlm({
      messages: [
        { role: "system", content: legalSystemPrompt({ utilityHint: "Resumen de documento" }) },
        {
          role: "user",
          content: `Resume en español el siguiente documento LexOpen ("${doc.nombre}"):\n\n${texto.slice(0, 20_000)}`,
        },
      ],
      causaId: doc.causaId || undefined,
      userId: ctx.userId,
      utilityLabel: "assistant.documento.resumir",
    });
    if (!result.content) {
      return { ok: false, message: result.note || "No se pudo generar el resumen." };
    }
    return {
      ok: true,
      message: result.content,
      card: { type: "documento-resumen", id: doc.id, nombre: doc.nombre, source: result.source },
    };
  },
};

export const documentoClasificarSchema = z.object({
  documentoId: z.string().min(1),
});
export type DocumentoClasificarInput = z.infer<typeof documentoClasificarSchema>;

export const documentoClasificarTool: AssistantTool<DocumentoClasificarInput> = {
  id: "documento.clasificar",
  description: "Sugiere y aplica un tipo de documento a partir del nombre/ruta",
  kind: "write",
  roles: [...STAFF_ROLES],
  inputSchema: documentoClasificarSchema,
  async preview(input, ctx) {
    const doc = await prisma.documento.findFirst({
      where: { id: input.documentoId, ...confidentialWhere(ctx.role) },
      select: { nombre: true, ruta: true, tipo: true },
    });
    if (!doc) return `Clasificar documento ${input.documentoId} (no encontrado o sin acceso).`;
    const sugerido = inferDocumentoTipo(doc.ruta ? `${doc.ruta}/${doc.nombre}` : doc.nombre);
    return `Clasificar "${doc.nombre}": tipo actual "${doc.tipo}" → sugerido "${sugerido}".`;
  },
  async execute(input, ctx) {
    const before = await prisma.documento.findFirst({
      where: { id: input.documentoId, ...confidentialWhere(ctx.role) },
    });
    if (!before) return { ok: false, message: "Documento no encontrado o sin acceso." };
    const tipo = inferDocumentoTipo(before.ruta ? `${before.ruta}/${before.nombre}` : before.nombre);
    if (tipo === before.tipo) {
      return { ok: true, message: `"${before.nombre}" ya está clasificado como "${tipo}".` };
    }
    const doc = await prisma.documento.update({
      where: { id: before.id },
      data: { tipo },
    });
    await writeAuditStrict({
      actorId: ctx.userId,
      action: "documento.update",
      entityType: "Documento",
      entityId: doc.id,
      before: { tipo: before.tipo },
      after: { tipo: doc.tipo },
    });
    const undoToken = await storeUndo({
      toolId: "documento.clasificar",
      entityType: "Documento",
      entityId: doc.id,
      before: { tipo: before.tipo },
    });
    return {
      ok: true,
      message: `"${doc.nombre}" clasificado como "${doc.tipo}".`,
      entityId: doc.id,
      undoToken,
      card: { type: "documento", id: doc.id, nombre: doc.nombre, tipo: doc.tipo },
    };
  },
  async undo(token, ctx) {
    const payload = await consumeUndo(token);
    if (!payload || payload.toolId !== "documento.clasificar") {
      return { ok: false, message: "Token de deshacer inválido o vencido." };
    }
    const before = payload.before as { tipo: string };
    const doc = await prisma.documento.update({ where: { id: payload.entityId }, data: before });
    await writeAuditStrict({
      actorId: ctx.userId,
      action: "documento.update",
      entityType: "Documento",
      entityId: doc.id,
      after: before,
    });
    return { ok: true, message: `Se restauró el tipo del documento "${doc.nombre}".` };
  },
};
