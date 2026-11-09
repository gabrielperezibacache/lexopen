/** Captured OJV session redirects are an unavailable response, never an empty list. */
export function assertOjvResponseAvailable(html: string): void {
  if (/<script\b[^>]*>[\s\S]*?(?:parent\s*\.\s*)?window\s*\.\s*(?:open\s*\(\s*['"](?:\.\.\/)*index(?:N)?\.php|location(?:\.href)?\s*=\s*['"](?:\.\.\/)*index(?:N)?\.php)/i.test(html)) {
    throw Object.assign(new Error("La OJV devolvió una redirección de sesión. Renueve el acceso y reintente; no se confirmó una lista vacía."), { code: "ojv_session_unavailable" });
  }
}
