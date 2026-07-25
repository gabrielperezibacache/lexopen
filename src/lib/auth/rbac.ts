export const ROLES = ["admin", "abogado", "asistente", "cliente"] as const;
export type Role = (typeof ROLES)[number];

const STAFF: Role[] = ["admin", "abogado", "asistente"];

export function isStaff(role: string) {
  return STAFF.includes(role as Role);
}

export function isAdmin(role: string) {
  return role === "admin";
}

export function isCliente(role: string) {
  return role === "cliente";
}

export function canAccessInternalApp(role: string) {
  return isStaff(role);
}

export function canManageBilling(role: string) {
  return role === "admin" || role === "abogado";
}

export function canSeeConfidential(role: string) {
  return role === "admin" || role === "abogado";
}

export function canImpersonate() {
  return process.env.NODE_ENV === "development" || process.env.LEXOPEN_DEMO_SWITCHER === "1";
}
