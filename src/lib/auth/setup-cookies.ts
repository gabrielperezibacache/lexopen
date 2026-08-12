/** One-time setup / recovery tokens carried in httpOnly cookies (never left in URLs). */

export const SETUP_TOKEN_COOKIE = "lexopen_setup_token";
export const RECOVERY_TOKEN_COOKIE = "lexopen_recovery_token";

export function setupCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure,
    path: "/",
    maxAge: 60 * 60, // 1 hour — enough for first-run / recovery UX
  };
}
