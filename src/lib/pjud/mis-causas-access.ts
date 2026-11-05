import { can, canSome, type PermissionSubject } from "@/lib/auth/permissions";

/** Personal manual import never grants access to the study's saved identity. */
export function manualMisCausasAllowed(user: PermissionSubject) {
  return user.role !== "asistente" && canSome(user, "causa.write") && canSome(user, "causa.read");
}

/** Refleja las autorizaciones existentes de las APIs Mis Causas y ClaveÚnica. */
export function misCausasCapabilities(user: PermissionSubject) {
  return {
    sync: user.role !== "asistente" && can(user, "causa.override_walls") && can(user, "causa.write"),
    credentials: can(user, "host.admin"),
  };
}
