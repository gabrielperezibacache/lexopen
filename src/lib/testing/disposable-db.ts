export function assertDisposableDatabaseUrl(raw: string | undefined): string {
  if (!raw) throw new Error("Use una base local desechable mediante E2E_DATABASE_URL");
  const url = new URL(raw);
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      !/(?:^|[_-])(?:test|e2e)(?:$|[_-])/i.test(decodeURIComponent(url.pathname.slice(1))) ||
      url.searchParams.has("host") || url.searchParams.has("hostaddr")) {
    throw new Error("La prueba requiere una base PostgreSQL local con nombre test/e2e");
  }
  return url.toString();
}
