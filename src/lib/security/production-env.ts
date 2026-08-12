/**
 * Flags that must never be active in NODE_ENV=production.
 * Checked at boot (instrumentation) and ignored at use-sites where applicable.
 */
export const FORBIDDEN_PRODUCTION_FLAGS = [
  "LEXOPEN_OPEN_ACCESS",
  "LEXOPEN_RELAX_CSRF",
  "LEXOPEN_ALLOW_PLAINTEXT_PASSWORDS",
  "LEXOPEN_DEMO_SWITCHER",
] as const;

/** Soft-warn flags: demote integrations to demo; not a hard boot failure. */
export const WARN_PRODUCTION_FLAGS = [
  "HERMES_ALLOW_DEMO",
  "PJUD_ALLOW_DEMO",
  "HERMES_ALLOW_PRIVATE_URL",
] as const;

export function listedProductionFlags(
  keys: readonly string[]
): string[] {
  if (process.env.NODE_ENV !== "production") return [];
  return keys.filter((key) => process.env[key] === "1");
}

export function forbiddenProductionFlags(): string[] {
  return listedProductionFlags(FORBIDDEN_PRODUCTION_FLAGS);
}

export function warnProductionFlags(): string[] {
  return listedProductionFlags(WARN_PRODUCTION_FLAGS);
}

/** Throws if a hard-forbidden security flag is set in production. */
export function assertSafeProductionEnv() {
  const bad = forbiddenProductionFlags();
  if (bad.length > 0) {
    throw new Error(
      `LexOpen: flags de seguridad prohibidas en producción: ${bad.join(", ")}. Desactívelas (≠1) y reinicie.`
    );
  }
  const warnings = warnProductionFlags();
  for (const flag of warnings) {
    console.warn(
      `[lexopen-security] ${flag}=1 en producción debilita controles; desactívelo si no es intencional.`
    );
  }
}
