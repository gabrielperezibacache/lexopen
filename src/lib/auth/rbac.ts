import {
  ROLES,
  STAFF_ROLES,
  PORTAL_ROLES,
  TWO_FACTOR_ROLES,
  type Role,
} from "@/lib/auth/roles";
import { can, canSome, type PermissionSubject } from "@/lib/auth/permissions";

export { ROLES };
export type { Role };

type Subject = string | PermissionSubject;

function roleOf(subject: Subject) {
  return typeof subject === "string" ? subject : subject.role;
}

export function isStaff(role: string) {
  return (STAFF_ROLES as readonly string[]).includes(role);
}

/** Admin técnico del Host (rol `admin` o grant `host.admin`). */
export function isAdmin(subject: Subject) {
  return can(subject, "host.admin");
}

/** Roles de portal (`cliente` y `externo`): fail-closed fuera del portal. */
export function isCliente(role: string) {
  return (PORTAL_ROLES as readonly string[]).includes(role);
}

export function requiresTwoFactorRole(role: string) {
  return (TWO_FACTOR_ROLES as readonly string[]).includes(role);
}

export function canAccessInternalApp(role: string) {
  return isStaff(role);
}

export function canManageBilling(subject: Subject) {
  return isStaff(roleOf(subject)) && canSome(subject, "billing.manage");
}

export function canSeeConfidential(subject: Subject) {
  return can(subject, "doc.confidential.read");
}

/**
 * Privilegio abogado-cliente. `scoped` (abogado) se trata como permitido en
 * listados, igual que en 1.0; el muro ético por causa limita el alcance.
 */
export function canSeePrivileged(subject: Subject) {
  return canSeeConfidential(subject) && canSome(subject, "doc.privileged.read");
}

export function canImpersonate() {
  return (
    process.env.NODE_ENV !== "production" &&
    (process.env.NODE_ENV === "development" ||
      process.env.LEXOPEN_DEMO_SWITCHER === "1")
  );
}
