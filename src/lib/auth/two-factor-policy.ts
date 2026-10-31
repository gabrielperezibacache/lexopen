/**
 * Política «2FA obligatorio para roles financieros/aprobadores» (D9).
 * Edge-safe: sin Prisma. El proxy carga el flag `FirmSettings.require2faPrivileged`
 * y el estado `User.totpEnabled`, y usa estas funciones para decidir.
 */

import { TWO_FACTOR_ROLES } from "./roles";

export const TWO_FACTOR_REQUIRED_CODE = "2fa_required";
export const TWO_FACTOR_SETUP_PATH = "/cuenta?requiere2fa=1";

export function mustEnrollTwoFactor(opts: {
  role: string;
  totpEnabled: boolean;
  policyEnabled: boolean;
}) {
  if (!opts.policyEnabled || opts.totpEnabled) return false;
  return (TWO_FACTOR_ROLES as readonly string[]).includes(opts.role);
}

/** Rutas que siguen abiertas mientras el usuario no enrola 2FA. */
export function isTwoFactorExemptPath(pathname: string) {
  if (pathname === "/cuenta" || pathname.startsWith("/cuenta/")) return true;
  if (/^\/api\/auth\/(me|logout|password|totp)(?:\/|$)/.test(pathname)) return true;
  if (pathname === "/api/health" || pathname === "/api/locale") return true;
  if (pathname === "/login" || pathname === "/logout") return true;
  return false;
}
