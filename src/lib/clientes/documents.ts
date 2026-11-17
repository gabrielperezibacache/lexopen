import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  documentReadWhere,
  type CausaAccessUser,
} from "@/lib/auth/causa-access";

/** Direct documents and accessible documents of the client's current causes. */
export function clienteDocumentsWhere(
  clienteId: string,
  user: CausaAccessUser,
): Prisma.DocumentoWhereInput {
  return {
    AND: [
      documentReadWhere(user),
      { OR: [{ clienteId }, { causa: { clienteId } }] },
    ],
  };
}
/** Aggregate identifiers and counts, never document bodies or one query per client. */
export async function clienteDocumentCounts(
  ids: string[],
  user: CausaAccessUser,
) {
  const result = new Map(ids.map((id) => [id, 0]));
  if (!ids.length) return result;
  const groups = await prisma.documento.groupBy({
    by: ["clienteId", "causaId"],
    where: {
      AND: [
        documentReadWhere(user),
        {
          OR: [
            { clienteId: { in: ids } },
            { causa: { clienteId: { in: ids } } },
          ],
        },
      ],
    },
    _count: { _all: true },
  });
  const caseIds = [
    ...new Set(groups.flatMap((g) => (g.causaId ? [g.causaId] : []))),
  ];
  const owners = new Map<string, string | null>();
  for (let offset = 0; offset < caseIds.length; offset += 500) {
    const cases = await prisma.causa.findMany({
      where: { id: { in: caseIds.slice(offset, offset + 500) } },
      select: { id: true, clienteId: true },
    });
    for (const cause of cases) owners.set(cause.id, cause.clienteId);
  }
  for (const group of groups) {
    for (const id of new Set([
      group.clienteId,
      group.causaId ? owners.get(group.causaId) : null,
    ])) {
      if (id && result.has(id))
        result.set(id, result.get(id)! + group._count._all);
    }
  }
  return result;
}
