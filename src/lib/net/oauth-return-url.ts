/**
 * Resolve an OAuth callback's return URL using configured canonical origins.
 * Request host headers are intentionally ignored because they may be supplied
 * by the caller and can be misleading behind a reverse proxy.
 */
function parseHttpUrl(value: string | undefined): URL | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.username ||
      parsed.password
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function resolveOAuthReturnUrl(
  reqUrl: string,
  targetPathAndQuery: string,
  configuredRedirectUri?: string
): URL {
  if (
    !targetPathAndQuery.startsWith("/") ||
    targetPathAndQuery.startsWith("//")
  ) {
    throw new TypeError("OAuth return path must be a same-origin absolute path");
  }

  const base =
    parseHttpUrl(configuredRedirectUri) ??
    parseHttpUrl(process.env.APP_URL) ??
    parseHttpUrl(process.env.NEXT_PUBLIC_APP_URL) ??
    parseHttpUrl(reqUrl);

  if (!base) {
    throw new TypeError("OAuth return URL requires a valid HTTP(S) origin");
  }

  const result = new URL(targetPathAndQuery, base.origin);
  // WHATWG URL treats backslashes as slashes for special schemes, so verify
  // the resolved origin as well as rejecting a protocol-relative input above.
  if (result.origin !== base.origin) {
    throw new TypeError("OAuth return path must remain on the selected origin");
  }
  return result;
}
