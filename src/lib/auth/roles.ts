/**
 * Catálogo de roles de estudio (edge-safe: sin imports de Node ni Prisma).
 * `User.role` sigue siendo String; los valores 1.0 (`admin`, `abogado`,
 * `asistente`, `cliente`) conservan su significado.
 */

export const ROLES = [
  "admin",
  "socio",
  "abogado",
  "procurador",
  "asistente",
  "contabilidad",
  "externo",
  "cliente",
] as const;

export type Role = (typeof ROLES)[number];

export const STAFF_ROLES: readonly Role[] = [
  "admin",
  "socio",
  "abogado",
  "procurador",
  "asistente",
  "contabilidad",
];

/** Roles que solo operan en el portal (nunca /inicio, asistente ni búsqueda de staff). */
export const PORTAL_ROLES: readonly Role[] = ["cliente", "externo"];

/** Roles financieros / aprobadores: 2FA obligatorio si la política del estudio lo exige. */
export const TWO_FACTOR_ROLES: readonly Role[] = ["admin", "socio", "contabilidad"];

export const VALID_ROLE_SET: ReadonlySet<string> = new Set<string>(ROLES);

export function isRole(value: string): value is Role {
  return VALID_ROLE_SET.has(value);
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin del Host",
  socio: "Socio/a",
  abogado: "Abogado/a",
  procurador: "Procurador/a",
  asistente: "Asistente / secretaria",
  contabilidad: "Contabilidad",
  externo: "Externo",
  cliente: "Cliente",
};

export function roleLabel(role: string) {
  return isRole(role) ? ROLE_LABELS[role] : role;
}
