import { z } from "zod";
import { prisma } from "@/lib/db";
import { askLlm, legalSystemPrompt } from "@/lib/integrations/llm";
import type { AssistantTool } from "./types";

const STAFF_ROLES = ["admin", "abogado", "asistente"] as const;

export const jurisprudenciaBuscarSchema = z.object({
  q: z.string().trim().min(1).max(300),
  materia: z.string().trim().max(120).optional(),
});
export type JurisprudenciaBuscarInput = z.infer<typeof jurisprudenciaBuscarSchema>;

export const jurisprudenciaBuscarTool: AssistantTool<JurisprudenciaBuscarInput> = {
  id: "jurisprudencia.buscar",
  description: "Busca fallos en el corpus de jurisprudencia LexOpen",
  kind: "read",
  roles: [...STAFF_ROLES],
  inputSchema: jurisprudenciaBuscarSchema,
  preview(input) {
    return `Buscar jurisprudencia sobre "${input.q}"${
      input.materia ? ` (materia ${input.materia})` : ""
    }.`;
  },
  async execute(input) {
    const rows = await prisma.jurisprudencia.findMany({
      where: {
        AND: [
          input.materia ? { materia: input.materia } : {},
          {
            OR: [
              { rol: { contains: input.q, mode: "insensitive" } },
              { caratula: { contains: input.q, mode: "insensitive" } },
              { descripcion: { contains: input.q, mode: "insensitive" } },
              { doctrina: { contains: input.q, mode: "insensitive" } },
              { tags: { contains: input.q, mode: "insensitive" } },
            ],
          },
        ],
      },
      select: { id: true, rol: true, tribunal: true, caratula: true, materia: true, fecha: true },
      orderBy: { fecha: "desc" },
      take: 15,
    });
    if (rows.length === 0) {
      return {
        ok: true,
        message: `Sin resultados de jurisprudencia para "${input.q}". El corpus LexOpen es una muestra local, no una base oficial.`,
      };
    }
    return {
      ok: true,
      message: `${rows.length} fallo(s) encontrado(s) para "${input.q}" en el corpus local LexOpen.`,
      card: { type: "jurisprudencia-lista", items: rows },
    };
  },
};

export const jurisprudenciaBriefSchema = z.object({
  jurisprudenciaId: z.string().min(1),
});
export type JurisprudenciaBriefInput = z.infer<typeof jurisprudenciaBriefSchema>;

export const jurisprudenciaBriefTool: AssistantTool<JurisprudenciaBriefInput> = {
  id: "jurisprudencia.brief",
  description: "Genera un brief con IA de un fallo del corpus local",
  kind: "read",
  roles: [...STAFF_ROLES],
  inputSchema: jurisprudenciaBriefSchema,
  preview(input) {
    return `Generar brief del fallo ${input.jurisprudenciaId} (borrador, requiere revisión humana).`;
  },
  async execute(input, ctx) {
    const fallo = await prisma.jurisprudencia.findUnique({ where: { id: input.jurisprudenciaId } });
    if (!fallo) return { ok: false, message: "Fallo no encontrado en el corpus local." };
    const texto = [fallo.doctrina, fallo.texto, fallo.descripcion].filter(Boolean).join("\n\n");
    if (!texto.trim()) {
      return { ok: false, message: `El fallo "${fallo.rol}" no tiene texto/doctrina indexada.` };
    }
    const result = await askLlm({
      messages: [
        { role: "system", content: legalSystemPrompt({ utilityHint: "Brief de jurisprudencia" }) },
        {
          role: "user",
          content: `Redacta un brief breve (hechos, doctrina, aplicación) del fallo ${fallo.rol} (${fallo.tribunal}):\n\n${texto.slice(0, 20_000)}`,
        },
      ],
      userId: ctx.userId,
      utilityLabel: "assistant.jurisprudencia.brief",
    });
    if (!result.content) {
      return { ok: false, message: result.note || "No se pudo generar el brief." };
    }
    return {
      ok: true,
      message: result.content,
      card: { type: "jurisprudencia-brief", id: fallo.id, rol: fallo.rol, source: result.source },
    };
  },
};
