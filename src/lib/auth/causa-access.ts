/**
 * Acceso a causas con muro ético opcional (`Causa.acceso = equipo`).
 * Las lecturas deben componer `causaAccessWhere(user)` con otros filtros.
 * Una causa inaccesible responde 404 (no 403) para no revelar existencia.
 */

import { writeAuditStrict } from "@/lib/audit";
import { httpError } from "@/lib/auth/access";
import { can, canSome, type Capability, type PermissionSubject } from "@/lib/auth/permissions";
import { isStaff } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

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
    desde: { lte: now },
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

  return { OR: [{ acceso: "estudio" }, memberOf, isAbogado] };
}

export async function getCausaMembership(causaId: string, userId: string) {
  const now = new Date();
  return prisma.causaMiembro.findFirst({
    where: {
      causaId,
      userId,
      desde: { lte: now },
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
  opts?: { auditOverride?: boolean },
  client: Pick<Prisma.TransactionClient, "causa" | "auditEvent"> = prisma
) {
  const causa = await client.causa.findUnique({
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
      if (override && !member && !isAbogado && opts?.auditOverride !== false) {
        await writeAuditStrict({
          actorId: user.id,
          action: "causa.override_walls",
          entityType: "Causa",
          entityId: causaId,
          after: { acceso: causa.acceso },
        }, client);
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
  if (causa.acceso === "estudio" && (levelAll || member || isAbogado || override)) {
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
  user: CausaAccessUser,
  client: Pick<Prisma.TransactionClient, "causa" | "auditEvent"> = prisma
) {
  const access = await assertCausaAccess(causaId, user, undefined, client);
  if (!can(user, "causa.team.manage", { causaRol: access.causaRol })) {
    throw httpError("Prohibido: no puede gestionar el equipo de esta causa", 403);
  }
  return access;
}

/** Asegura CausaMiembro responsable al crear/reasignar abogado. */
export async function ensureResponsableMiembro(
  causaId: string,
  userId: string,
  agregadoPorId?: string | null,
  client: Prisma.TransactionClient = prisma
) {
  await client.causaMiembro.upsert({
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

/** Related records with no matter remain usable; linked records inherit its wall. */
export function relatedCausaWhere(user: CausaAccessUser) {
  const allowed = causaAccessWhere(user);
  if (Object.keys(allowed).length === 0) return {};
  return { OR: [{ causaId: null }, { causa: allowed }] };
}

export function siteAccessWhere(user: CausaAccessUser): Prisma.SiteWhereInput {
  if (user.role === "cliente" || user.role === "externo") {
    return { isClientVisible: true, members: { some: { userId: user.id } } };
  }
  return relatedCausaWhere(user);
}

export function taskAccessWhere(user: CausaAccessUser): Prisma.TaskWhereInput {
  const sources: Prisma.TaskWhereInput = can(user, "doc.confidential.read") ? {} : { minutaAcciones: { none: { minuta: { confidencial: true } } } };
  if (user.role === "cliente" || user.role === "externo") return { AND: [sources, { assigneeId: user.id, site: siteAccessWhere(user) }] };
  const site = siteAccessWhere(user);
  return { AND: [sources, relatedCausaWhere(user), ...(Object.keys(site).length ? [{ OR: [{ siteId: null }, { site }] }] : [])] };
}

/** Authorization for the operation, not merely for reading its matter. */
export async function assertCausaCapability(
  causaId: string,
  user: CausaAccessUser,
  cap: Capability,
  client: Pick<Prisma.TransactionClient, "causa" | "auditEvent"> = prisma
) {
  const access = await assertCausaAccess(causaId, user, undefined, client);
  if (!can(user, cap, { causaRol: access.causaRol })) {
    throw httpError("Prohibido: no tiene permiso para esta operación", 403);
  }
  return access;
}

export function requiredCausaWhere(user: CausaAccessUser) {
  const allowed = causaAccessWhere(user);
  return Object.keys(allowed).length ? { causa: allowed } : {};
}
export function fileAccessWhere(user: CausaAccessUser) {
  const allowed = siteAccessWhere(user);
  return Object.keys(allowed).length ? { site: allowed } : {};
}
export function siteRelatedWhere(user: CausaAccessUser) {
  const allowed = siteAccessWhere(user);
  return Object.keys(allowed).length ? { site: allowed } : {};
}

/** Scoped financial permissions apply to matter membership, not all readable matters. */
export function billingRelatedWhere(user: CausaAccessUser) {
  if (can(user, "billing.manage")) return relatedCausaWhere(user);
  if (!canSome(user, "billing.manage")) return { id: "__none__" };
  return { causa: { AND: [causaAccessWhere(user), { OR: [{ abogadoId: user.id }, { miembros: { some: activeMembershipFilter(user.id) } }] }] } };
}

export async function assertBillingCausa(user: CausaAccessUser, causaId?: string | null, cap: Capability = "billing.manage", client: Pick<Prisma.TransactionClient, "causa" | "auditEvent"> = prisma) {
  if (causaId) return assertCausaCapability(causaId, user, cap, client);
  if (!can(user, cap)) throw httpError("Se requiere un expediente autorizado para esta operación", 403);
}

export async function assertEventMutation(user: CausaAccessUser, record: { responsableId: string; causaId?: string | null }, client: Prisma.TransactionClient = prisma) {
  if (record.causaId) await assertCausaAccess(record.causaId, user, undefined, client);
  const own = record.responsableId === user.id;
  if (!can(user, "evento.manage", { own })) {
    const { canActViaDelegacion } = await import("@/lib/auth/delegacion");
    if (own || !await canActViaDelegacion({ actorId: user.id, onBehalfOfId: record.responsableId, cap: "evento.manage" }, client)) throw httpError("No puede gestionar esta agenda", 403);
  }
}

function privilegedMatterWhere(user: CausaAccessUser): Prisma.CausaWhereInput {
  return { OR: [{ abogadoId: user.id }, { miembros: { some: activeMembershipFilter(user.id) } }] };
}

/** Flags and scoped privilege are enforced before returning candidates or bytes. */
function directDocumentReadWhere(user: CausaAccessUser): Prisma.DocumentoWhereInput {
  const confidential = can(user, "doc.confidential.read");
  const privilege = confidential && can(user, "doc.privileged.read");
  const scoped = confidential && canSome(user, "doc.privileged.read");
  // Legacy minute documents may predate propagation of the confidential flag.
  return { AND: [relatedCausaWhere(user), confidential ? {} : { confidencial: false, minutas: { none: { confidencial: true } } }, privilege ? {} : scoped ? { OR: [{ privilegio: false }, { autorId: user.id }, { causa: privilegedMatterWhere(user) }] } : { privilegio: false }] };
}

export function documentReadWhere(user: CausaAccessUser): Prisma.DocumentoWhereInput {
  const liveOwner: Prisma.CaseAudioWhereInput = { OR: [{ liveSessionId: null }, { liveSession: { workspace: { ownerId: user.id } } }] };
  return { AND: [directDocumentReadWhere(user), { OR: [{ caseAudioSource: null }, { caseAudioSource: liveOwner }] }, { OR: [
    { audioPublication: null },
    { audioPublication: { audio: { AND: [liveOwner, { deletedAt: null, causa: causaAccessWhere(user), sourceDocument: directDocumentReadWhere(user) }] } } },
  ] }] };
}

export function siteFileReadWhere(user: CausaAccessUser): Prisma.SiteFileWhereInput {
  const confidential = can(user, "doc.confidential.read");
  const privilege = confidential && can(user, "doc.privileged.read");
  const scoped = confidential && canSome(user, "doc.privileged.read");
  return { AND: [fileAccessWhere(user), confidential ? {} : { confidencial: false }, privilege ? {} : scoped ? { OR: [{ privilegio: false }, { site: { causa: privilegedMatterWhere(user) } }] } : { privilegio: false }] };
}

/** A deadline derived from a confidential minute inherits that restriction. */
export function plazoAccessWhere(user: CausaAccessUser): Prisma.PlazoWhereInput {
  return { AND: [relatedCausaWhere(user), can(user, "doc.confidential.read") ? {} : { minutaAcciones: { none: { minuta: { confidencial: true } } } }] };
}
