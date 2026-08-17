import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";

/** Causas the actor may link or apply mail against (single-firm ACL). */
export function causaMailWhere(user: Pick<User, "id" | "role">) {
  if (user.role === "admin") return { estado: { not: "archivada" as const } };
  return {
    estado: { not: "archivada" as const },
    OR: [{ abogadoId: null }, { abogadoId: user.id }],
  };
}

export async function assertCausaMailAccess(
  user: Pick<User, "id" | "role">,
  causaId: string
) {
  const causa = await prisma.causa.findFirst({
    where: { id: causaId, ...causaMailWhere(user) },
    select: { id: true },
  });
  if (!causa) {
    const err = new Error("Causa no encontrada o sin permiso") as Error & {
      status: number;
    };
    err.status = 403;
    throw err;
  }
  return causa;
}
