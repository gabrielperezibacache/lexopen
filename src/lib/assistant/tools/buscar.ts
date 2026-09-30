import { z } from "zod";
import { prisma } from "@/lib/db";
import { confidentialWhere } from "@/lib/api";
import { ftsCausaIds, ftsDocumentoIds } from "@/lib/search";
import type { AssistantTool } from "./types";

const STAFF_ROLES = ["admin", "abogado", "asistente"] as const;

export const buscarSchema = z.object({
  q: z.string().trim().min(1).max(300),
});
export type BuscarInput = z.infer<typeof buscarSchema>;

/** Búsqueda global (causas + documentos) reutilizando `lib/search` (FTS + fallback ILIKE). */
export const buscarTool: AssistantTool<BuscarInput> = {
  id: "buscar",
  description: "Búsqueda global en causas y documentos",
  kind: "read",
  roles: [...STAFF_ROLES],
  inputSchema: buscarSchema,
  preview(input) {
    return `Buscar "${input.q}" en causas y documentos.`;
  },
  async execute(input, ctx) {
    const causaIds = await ftsCausaIds(prisma, input.q, 10);
    const documentoIds = await ftsDocumentoIds(prisma, input.q, 10);

    const [causas, documentos] = await Promise.all([
      causaIds !== null
        ? prisma.causa.findMany({
            where: { id: { in: causaIds } },
            select: { id: true, titulo: true, rit: true },
          })
        : prisma.causa.findMany({
            where: {
              OR: [
                { titulo: { contains: input.q, mode: "insensitive" } },
                { rit: { contains: input.q, mode: "insensitive" } },
                { caratula: { contains: input.q, mode: "insensitive" } },
              ],
            },
            select: { id: true, titulo: true, rit: true },
            take: 10,
          }),
      documentoIds !== null
        ? prisma.documento.findMany({
            where: { id: { in: documentoIds }, ...confidentialWhere(ctx.role) },
            select: { id: true, nombre: true, causaId: true },
          })
        : prisma.documento.findMany({
            where: {
              ...confidentialWhere(ctx.role),
              nombre: { contains: input.q, mode: "insensitive" },
            },
            select: { id: true, nombre: true, causaId: true },
            take: 10,
          }),
    ]);

    if (causas.length === 0 && documentos.length === 0) {
      return { ok: true, message: `No se encontraron resultados para "${input.q}".` };
    }
    return {
      ok: true,
      message: `${causas.length} causa(s) y ${documentos.length} documento(s) para "${input.q}".`,
      card: { type: "busqueda-global", causas, documentos },
    };
  },
};
