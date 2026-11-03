import { can, type PermissionSubject } from "@/lib/auth/permissions";

/** Refleja las autorizaciones existentes de las APIs Mis Causas y ClaveÚnica. */
export function misCausasCapabilities(user: PermissionSubject) {
  return {
    sync: user.role !== "asistente" && can(user, "causa.override_walls") && can(user, "causa.write"),
    credentials: can(user, "host.admin"),
  };
}
