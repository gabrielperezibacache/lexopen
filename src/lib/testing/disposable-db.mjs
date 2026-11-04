/** Shared by the destructive E2E launcher and every database-backed test. */
export function assertDisposableDatabaseUrl(raw) {
  if (!raw) throw new Error("Use una base local desechable mediante E2E_DATABASE_URL");
  const url = new URL(raw);
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      !/(?:^|[_-])(?:test|e2e)(?:$|[_-])/i.test(decodeURIComponent(url.pathname.slice(1)))) {
    throw new Error("La prueba requiere una base PostgreSQL local con nombre test/e2e");
  }
  const seen = new Set();
  for (const [key, value] of url.searchParams) {
    if (seen.has(key) || !(key === "schema" && /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(value) || ["connection_limit", "pool_timeout"].includes(key) && /^\d{1,5}$/.test(value))) {
      throw new Error("La base desechable no admite opciones de conexión que cambien el destino");
    }
    seen.add(key);
  }
  if (url.hash) throw new Error("La base desechable no admite fragmentos en su URL");
  return url.toString();
}
