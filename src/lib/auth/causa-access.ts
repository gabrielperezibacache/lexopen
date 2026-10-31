/**
 * Acceso a causas con muro ético opcional (`Causa.acceso = equipo`).
 * Las lecturas deben componer `causaAccessWhere(user)` con otros filtros.
 * Una causa inaccesible responde 404 (no 403) para no revelar existencia.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import { can, canSome, type PermissionSubject } from "@/lib/auth/permissions";
import { isStaff } from "@/lib/auth/rbac";
import { writeAuditStrict } from "@/lib/audit";

export const CAUSA_MIEMBRO_ROLES = [
  "responsable",
  "colaborador",
  "procurador",
  "supervisor",
  "externo",
  "lectura",
] as const;

export type CausaMiembroRol = (typeof CAUSA_MIEMBRO_ROLES)[number];

export type CausaAccessUser = PermissionSubject & { id: string };

function activeMembershipFilter(userId: string): Prisma.CausaMiembroWhereInput {
  const now = new Date();
  return {
    userId,
    OR: [{ hasta: null }, { hasta: { gt: now } }],
  };
}

/** Filtro Prisma para listados / búsquedas de Causa. */
export function causaAccessWhere(user: CausaAccessUser): Prisma.CausaWhereInput {
  if (!isStaff(user.role) && user.role !== "externo") {
    // Cliente: solo causas ligadas a su portal (el llamador añade más filtros).
    return { id: "__none__" };
  }

  const level = canSome(user, "causa.read")
    ? can(user, "causa.read")
      ? "all"
      : "scoped"
    : "none";

  if (level === "none") return { id: "__none__" };

  const memberOf = { miembros: { some: activeMembershipFilter(user.id) } };
  const isAbogado = { abogadoId: user.id };
  const canOverride = can(user, "causa.override_walls");

  if (level === "scoped") {
    // Contabilidad / externo: solo causas donde es miembro (o abogado asignado).
    return { OR: [memberOf, isAbogado] };
  }

  // Nivel all: todo el staff ve `estudio`; `equipo` solo miembros o override.
  if (canOverride) return {};

  return {
    OR: [{ acceso: "estudio" }, { acceso: { not: "equipo" } }, memberOf, isAbogado],
  };
}

export async function getCausaMembership(causaId: string, userId: string) {
  const now = new Date();
  return prisma.causaMiembro.findFirst({
    where: {
      causaId,
      userId,
      OR: [{ hasta: null }, { hasta: { gt: now } }],
    },
  });
}

/**
 * Comprueba lectura de una causa. Devuelve el rol de miembro (o null si
 * acceso por estudio/override) o lanza 404.
 */
export async function assertCausaAccess(
  causaId: string,
  user: CausaAccessUser,
  opts?: { auditOverride?: boolean }
) {
  const causa = await prisma.causa.findUnique({
    where: { id: causaId },
    select: {
      id: true,
      acceso: true,
      abogadoId: true,
      miembros: {
        where: activeMembershipFilter(user.id),
        select: { id: true, rol: true },
        take: 1,
      },
    },
  });
  if (!causa) throw httpError("No encontrada", 404);

  if (!canSome(user, "causa.read")) throw httpError("No encontrada", 404);

  const member = causa.miembros[0] ?? null;
  const isAbogado = causa.abogadoId === user.id;
  const override = can(user, "causa.override_walls");
  const levelAll = can(user, "causa.read");

  if (causa.acceso === "equipo") {
    if (member || isAbogado || override) {
      // Solo auditar cuando el llamador lo pide (p. ej. export / override explícito).
      if (override && !member && !isAbogado && opts?.auditOverride === true) {
        await writeAuditStrict({
          actorId: user.id,
          action: "causa.override_walls",
          entityType: "Causa",
          entityId: causaId,
          after: { acceso: causa.acceso },
        });
      }
      return {
        causa,
        causaRol: member?.rol ?? (isAbogado ? "responsable" : null),
        viaOverride: Boolean(override && !member && !isAbogado),
      };
    }
    throw httpError("No encontrada", 404);
  }

  // acceso = estudio (default)
  if (levelAll || member || isAbogado || override) {
    return {
      causa,
      causaRol: member?.rol ?? (isAbogado ? "responsable" : null),
      viaOverride: false,
    };
  }
  throw httpError("No encontrada", 404);
}

export async function assertCausaTeamManage(
  causaId: string,
  user: CausaAccessUser
) {
  const access = await assertCausaAccess(causaId, user);
  if (!can(user, "causa.team.manage", { causaRol: access.causaRol })) {
    throw httpError("Prohibido: no puede gestionar el equipo de esta causa", 403);
  }
  return access;
}

/** Asegura CausaMiembro responsable al crear/reasignar abogado. */
export async function ensureResponsableMiembro(
  causaId: string,
  userId: string,
  agregadoPorId?: string | null
) {
  await prisma.causaMiembro.upsert({
    where: { causaId_userId: { causaId, userId } },
    create: {
      causaId,
      userId,
      rol: "responsable",
      agregadoPorId: agregadoPorId || null,
    },
    update: { rol: "responsable", hasta: null },
  });
}
