/**
 * Allowlist navigation targets for the PJUD salas portal (Playwright).
 * Prevents staff/API input from turning scrape into open SSRF.
 */

const DEFAULT_SALAS = "https://salas.pjud.cl/";

const ALLOWED_HOSTS = new Set(["salas.pjud.cl", "www.salas.pjud.cl"]);

export function defaultSalasUrl() {
  return process.env.PJUD_SALAS_URL?.trim() || DEFAULT_SALAS;
}

export function assertSafeSalasUrl(raw?: string | null): string {
  const candidate = (raw?.trim() || defaultSalasUrl()).trim();
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("URL de salas inválida");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("URL de salas: solo http(s)");
  }
  // Prefer https for the official portal; allow http only for explicit env overrides
  // that already point at an allowlisted host (local mirrors).
  if (url.username || url.password) {
    throw new Error("URL de salas no puede incluir credenciales");
  }
  const host = url.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) {
    throw new Error(
      `URL de salas no permitida (host ${host}). Use salas.pjud.cl.`
    );
  }
  return url.toString();
}
