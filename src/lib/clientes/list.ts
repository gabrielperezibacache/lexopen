import type { Prisma } from "@prisma/client";
import { causaAccessWhere, documentReadWhere, type CausaAccessUser } from "@/lib/auth/causa-access";
import { TRAMITES_ABIERTOS } from "@/lib/tramites";

/** The directory and its API count only records the actor can actually read. */
export function clienteListInclude(user: CausaAccessUser) {
  const causes = causaAccessWhere(user);
  return {
    abogado: { select: { id: true, name: true } },
    _count: { select: { causas: { where: causes }, documentos: { where: documentReadWhere(user) } } },
    causas: {
      where: causes,
      select: {
        id: true,
        _count: { select: { tramites: { where: { estado: { in: [...TRAMITES_ABIERTOS] } } } } },
      },
    },
  } satisfies Prisma.ClienteInclude;
}
