/**
 * Capacidades por rol (PLAN-PRODUCTO-ESTUDIOS §3.3). Puro: sin Prisma ni Node,
 * usable en servidor, proxy y componentes cliente.
 *
 * Niveles: `all` (✔), `scoped` (◐ — solo causas donde es miembro / recursos
 * propios; el llamador debe aportar `scope`), `none` (✖).
 * `User.capabilityGrants` eleva a `all`; `capabilityRevokes` baja a `none`
 * (los revokes ganan).
 */

import { ROLES, type Role } from "./roles";

export const CAPABILITIES = [
  "causa.read",
  "causa.write",
  "causa.create",
  "causa.team.manage",
  "causa.override_walls",
  "doc.confidential.read",
  "doc.privileged.read",
  "escrito.draft",
  "escrito.approve",
  "plazo.edit",
  "plazo.close",
  "evento.manage",
  "cita.book",
  "task.assign",
  "time.log",
  "time.approve",
  "billing.manage",
  "billing.rates",
  "ledger.provision",
  "reports.firm",
  "client.message",
  "assistant.use",
  "voice.use",
  "notify.channels.self",
  "host.admin",
  "audit.read",
] as const;

export type Capability = (typeof CAPABILITIES)[number];
export type CapabilityLevel = "all" | "scoped" | "none";

const CAPABILITY_SET: ReadonlySet<string> = new Set<string>(CAPABILITIES);

export function isCapability(value: string): value is Capability {
  return CAPABILITY_SET.has(value);
}

type Row = Record<Role, CapabilityLevel>;
const Y = "all" as const;
const P = "scoped" as const;
const N = "none" as const;

/** Orden de columnas: admin, socio, abogado, procurador, asistente, contabilidad, externo, cliente. */
function row(...levels: CapabilityLevel[]): Row {
  if (levels.length !== ROLES.length) {
    throw new Error("permissions: fila de matriz incompleta");
  }
  return Object.fromEntries(ROLES.map((r, i) => [r, levels[i]])) as Row;
}

export const CAPABILITY_MATRIX: Record<Capability, Row> = {
  //                         admin socio abog proc asist conta ext  cli
  "causa.read":            row(Y, Y, Y, Y, Y, P, P, P),
  "causa.write":           row(Y, Y, P, P, P, N, N, N),
  "causa.create":          row(Y, Y, Y, Y, Y, N, N, N),
  "causa.team.manage":     row(Y, Y, P, N, N, N, N, N),
  "causa.override_walls":  row(N, Y, N, N, N, N, N, N),
  "doc.confidential.read": row(Y, Y, Y, N, N, N, N, N),
  "doc.privileged.read":   row(N, Y, P, N, N, N, N, N),
  "escrito.draft":         row(N, Y, Y, Y, P, N, P, N),
  "escrito.approve":       row(N, Y, P, N, N, N, N, N),
  "plazo.edit":            row(Y, Y, Y, Y, P, N, N, N),
  "plazo.close":           row(Y, Y, P, P, N, N, N, N),
  "evento.manage":         row(Y, Y, P, P, Y, N, N, N),
  "cita.book":             row(Y, Y, Y, N, Y, N, N, P),
  "task.assign":           row(Y, Y, Y, P, P, P, N, N),
  "time.log":              row(N, Y, Y, Y, Y, N, P, N),
  "time.approve":          row(N, Y, P, N, N, Y, N, N),
  "billing.manage":        row(Y, Y, P, N, N, Y, N, N),
  "billing.rates":         row(N, Y, N, N, N, P, N, N),
  "ledger.provision":      row(N, Y, N, N, N, Y, N, N),
  "reports.firm":          row(Y, Y, P, N, N, Y, N, N),
  "client.message":        row(N, Y, Y, P, Y, P, N, Y),
  "assistant.use":         row(Y, Y, Y, Y, Y, Y, N, N),
  "voice.use":             row(P, Y, Y, Y, Y, N, N, N),
  "notify.channels.self":  row(Y, Y, Y, Y, Y, Y, Y, Y),
  "host.admin":            row(Y, N, N, N, N, N, N, N),
  "audit.read":            row(Y, Y, N, N, N, N, N, N),
};

/**
 * Capacidades de negocio que un `admin` 1.0 ejercía de hecho. Se otorgan como
 * grants al admin fundador (setup), en la migración de usuarios existentes y
 * en el seed, para que separar `admin` técnico de `socio` no quite acceso a
 * nadie al actualizar.
 */
export const FOUNDER_ADMIN_GRANTS: readonly Capability[] = [
  "causa.override_walls",
  "doc.privileged.read",
  "escrito.draft",
  "escrito.approve",
  "time.log",
  "time.approve",
  "billing.rates",
  "ledger.provision",
  "client.message",
  "voice.use",
];

export type PermissionSubject = {
  id?: string;
  role: string;
  capabilityGrants?: string | null;
  capabilityRevokes?: string | null;
};

/** Contexto para capacidades ◐: membresía en la causa o recurso propio. */
export type PermissionScope = {
  /** Rol en `CausaMiembro` (o "responsable" si es `Causa.abogadoId`). */
  causaRol?: string | null;
  /** El recurso pertenece al usuario (autor/asignado/responsable). */
  own?: boolean;
};

export function parseCapabilityCsv(csv: string | null | undefined): Capability[] {
  if (!csv) return [];
  const out: Capability[] = [];
  for (const raw of csv.split(",")) {
    const v = raw.trim();
    if (v && isCapability(v) && !out.includes(v)) out.push(v);
  }
  return out;
}

export function serializeCapabilityCsv(list: readonly string[]): string {
  return parseCapabilityCsv(list.join(",")).join(",");
}

function subjectOf(subject: string | PermissionSubject): PermissionSubject {
  return typeof subject === "string" ? { role: subject } : subject;
}

export function presetLevel(role: string, cap: Capability): CapabilityLevel {
  const r = CAPABILITY_MATRIX[cap];
  return (r as Record<string, CapabilityLevel>)[role] ?? "none";
}

export function capabilityLevel(
  subject: string | PermissionSubject,
  cap: Capability
): CapabilityLevel {
  const s = subjectOf(subject);
  if (parseCapabilityCsv(s.capabilityRevokes).includes(cap)) return "none";
  if (parseCapabilityCsv(s.capabilityGrants).includes(cap)) return "all";
  return presetLevel(s.role, cap);
}

/** Roles con los que un `scoped` se satisface por membresía de causa. */
const CAUSA_TEAM_MANAGER_ROLES = new Set(["responsable", "supervisor"]);

function scopeSatisfied(cap: Capability, scope: PermissionScope | undefined) {
  if (!scope) return false;
  if (scope.own) return true;
  const rol = scope.causaRol;
  if (!rol) return false;
  if (cap === "causa.team.manage" || cap === "escrito.approve" || cap === "time.approve") {
    return CAUSA_TEAM_MANAGER_ROLES.has(rol);
  }
  if (cap === "causa.write" || cap === "plazo.close") return rol !== "lectura";
  return true;
}

/**
 * `can(user, cap)` → true solo con nivel `all`.
 * `can(user, cap, scope)` → además acepta `scoped` si el scope lo satisface.
 * Para saber si el rol tiene *algo* de la capacidad (p. ej. mostrar un menú)
 * use `canSome`.
 */
export function can(
  subject: string | PermissionSubject,
  cap: Capability,
  scope?: PermissionScope
): boolean {
  const level = capabilityLevel(subject, cap);
  if (level === "all") return true;
  if (level === "none") return false;
  return scopeSatisfied(cap, scope);
}

export function canSome(subject: string | PermissionSubject, cap: Capability) {
  return capabilityLevel(subject, cap) !== "none";
}

export function effectiveCapabilities(subject: string | PermissionSubject) {
  return CAPABILITIES.map((cap) => ({ cap, level: capabilityLevel(subject, cap) }));
}

export const CAPABILITY_LABELS: Record<Capability, string> = {
  "causa.read": "Ver causas",
  "causa.write": "Editar causas (datos, etapa)",
  "causa.create": "Crear causas / alta PJUD",
  "causa.team.manage": "Gestionar equipo de la causa",
  "causa.override_walls": "Atravesar muros éticos (auditado)",
  "doc.confidential.read": "Ver documentos confidenciales",
  "doc.privileged.read": "Ver documentos con privilegio",
  "escrito.draft": "Redactar escritos",
  "escrito.approve": "Aprobar escritos",
  "plazo.edit": "Crear/editar plazos",
  "plazo.close": "Marcar plazos cumplidos",
  "evento.manage": "Gestionar agenda de otros",
  "cita.book": "Agendar citas con clientes",
  "task.assign": "Asignar tareas a otros",
  "time.log": "Registrar horas",
  "time.approve": "Aprobar horas",
  "billing.manage": "Facturación y pagos",
  "billing.rates": "Tarifas y honorarios",
  "ledger.provision": "Provisión de fondos",
  "reports.firm": "Reportes del estudio",
  "client.message": "Mensajes a clientes",
  "assistant.use": "Usar el asistente",
  "voice.use": "Usar voz",
  "notify.channels.self": "Configurar mis canales",
  "host.admin": "Administrar el Host (usuarios, integraciones)",
  "audit.read": "Ver auditoría",
};
