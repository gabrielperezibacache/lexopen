import { causaAccessWhere, documentReadWhere } from "@/lib/auth/causa-access";
import { secureTool } from "@/lib/assistant/secure-tool";
import { z } from "zod";
import { assistantDb as prisma } from "@/lib/assistant/transaction-context";
import { ftsCausaIds, ftsDocumentoIds } from "@/lib/search";
import type { AssistantTool } from "./types";

import { STAFF_ROLES } from "@/lib/auth/roles";

export const buscarSchema = z.object({
  q: z.string().trim().min(1).max(300),
});
export type BuscarInput = z.infer<typeof buscarSchema>;

/** Búsqueda global (causas + documentos) reutilizando `lib/search` (FTS + fallback ILIKE). */
export const buscarTool: AssistantTool<BuscarInput> = secureTool({
  id: "buscar",
  description: "Búsqueda global en causas y documentos",
  kind: "read",
  roles: [...STAFF_ROLES],
  inputSchema: buscarSchema,
  preview(input) {
    return `Buscar "${input.q}" en causas y documentos.`;
  },
  async execute(input, ctx) {
    const user = { ...ctx, id: ctx.userId };
    const causaScope = causaAccessWhere(user);
    const documentoScope = documentReadWhere(user);
    const [causaIds, documentoIds] = await Promise.all([
      ftsCausaIds(prisma, input.q, ids => prisma.causa.findMany({
        where: { AND: [causaScope, { id: { in: ids } }] }, select: { id: true },
      }), 10),
      ftsDocumentoIds(prisma, input.q, ids => prisma.documento.findMany({
        where: { AND: [documentoScope, { id: { in: ids } }] }, select: { id: true },
      }), 10),
    ]);

    const [causas, documentos] = await Promise.all([
      causaIds !== null
        ? prisma.causa.findMany({
            where: { AND: [causaScope, { id: { in: causaIds } }] },
            select: { id: true, titulo: true, rit: true },
          })
        : prisma.causa.findMany({
            where: {
              AND: [causaScope],
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
            where: { AND: [documentoScope, { id: { in: documentoIds } }] },
            select: { id: true, nombre: true, causaId: true },
          })
        : prisma.documento.findMany({
            where: {
              ...documentoScope,
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
});
