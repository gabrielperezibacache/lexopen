/**
 * Allowlist for shell.openExternal — prevents XSS in the renderer from
 * turning into an arbitrary URL trampoline.
 */

function normalizeRemoteUrl(url) {
  const t = String(url || "").trim().replace(/\/+$/, "");
  if (!t) return "";
  if (!/^https?:\/\//i.test(t)) return `http://${t}`;
  return t;
}

function hostFromUrl(url) {
  try {
    return new URL(normalizeRemoteUrl(url)).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function collectAllowedHosts(sources) {
  const hosts = new Set();
  for (const source of sources) {
    const host = hostFromUrl(source);
    if (host) hosts.add(host);
  }
  // Always allow loopback for local Host / docs opened against the app.
  hosts.add("127.0.0.1");
  hosts.add("localhost");
  hosts.add("[::1]");
  return hosts;
}

function parseExternalUrl(url) {
  if (typeof url !== "string" || url.length > 12000 || /[\u0000-\u0020\u007f]/.test(url)) return null;
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isAllowedAppUrl(url, appUrls = []) {
  const parsed = parseExternalUrl(url);
  if (!parsed || url.length > 2048 || !["http:", "https:"].includes(parsed.protocol)) return false;
  return matchesAllowedHost(parsed.hostname.toLowerCase(), collectAllowedHosts(appUrls));
}

function matchesAllowedHost(host, allowed) {
  if (allowed.has(host)) return true;
  // Preserve documentation subdomains of configured app hosts.
  return [...allowed].some(allowedHost => allowedHost && host.endsWith(`.${allowedHost}`));
}

const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
const callbackPath = "/api/altazor/connectors/oauth/callback";
const privateParameters = /^(?:user(?:name)?|pass(?:word)?|(?:access_|refresh_|id_)?token|client_secret|code_verifier)$/i;
const redirectParameters = /^(?:redirect(?:_uri|_url|_to)?|return(?:_to|_url)?|next|continue|url)$/i;

function isAppOAuthCallback(value, appUrls) {
  const callback = parseExternalUrl(value);
  if (!callback || !loopbackHosts.has(callback.hostname) || !["http:", "https:"].includes(callback.protocol) || callback.pathname !== callbackPath || callback.search || callback.hash) return false;
  // Loopback aliases are equivalent, but an arbitrary local service is not.
  return appUrls.some(source => {
    const app = parseExternalUrl(normalizeRemoteUrl(source));
    return app && loopbackHosts.has(app.hostname) && app.protocol === callback.protocol && app.port === callback.port;
  });
}

function isAllowedOAuthUrl(parsed, appUrls) {
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol !== "https:" || parsed.port || parsed.hash) return false;
  if (host === "github.com" && parsed.pathname === "/login/device") return !parsed.search;
  const expectedPath = host === "accounts.google.com" ? "/o/oauth2/v2/auth"
    : host === "www.dropbox.com" ? "/oauth2/authorize"
      : host === "github.com" ? "/login/oauth/authorize"
        : host === "login.microsoftonline.com" ? "/common/oauth2/v2.0/authorize" : null;
  if (!expectedPath || parsed.pathname !== expectedPath) return false;

  const params = parsed.searchParams;
  const keys = [...params.keys()];
  const allowedParameters = new Set(["response_type", "client_id", "redirect_uri", "state", "scope", "code_challenge", "code_challenge_method",
    ...(host === "accounts.google.com" ? ["access_type", "include_granted_scopes", "prompt"] : []),
    ...(host === "login.microsoftonline.com" ? ["response_mode", "prompt"] : []),
    ...(host === "www.dropbox.com" ? ["token_access_type"] : [])]);
  if (new Set(keys.map(key => key.toLowerCase())).size !== keys.length) return false;
  if (keys.some(key => !allowedParameters.has(key)) || [...params.values()].some(value => /[\u0000-\u001f\u007f]/.test(value))) return false;
  if (host === "login.microsoftonline.com") {
    const scopes = (params.get("scope") || "").split(" ").sort();
    if (params.get("response_mode") !== "query" || scopes.join(" ") !== "Files.Read User.Read offline_access") return false;
    try { if (new URL(params.get("redirect_uri")).hostname !== "localhost") return false; } catch { return false; }
  }
  return params.get("response_type") === "code" && Boolean(params.get("client_id")) && /^[A-Za-z0-9_-]{43}$/.test(params.get("state") || "")
    && /^[A-Za-z0-9_-]{43}$/.test(params.get("code_challenge") || "") && params.get("code_challenge_method") === "S256"
    && isAppOAuthCallback(params.get("redirect_uri"), appUrls);
}

function hasUnsafeFragment(parsed) {
  try {
    const fragment = decodeURIComponent(parsed.hash.slice(1));
    return /[\u0000-\u0020\u007f]|(?:javascript|data|https?):/i.test(fragment)
      || [...new URLSearchParams(fragment).keys()].some(key => privateParameters.test(key) || redirectParameters.test(key));
  } catch {
    return true;
  }
}

function hasUnsafeRedirect(parsed, appUrls) {
  for (const [key, value] of parsed.searchParams) {
    if (!redirectParameters.test(key)) continue;
    // Keep the existing personal LinkedIn authorization handoff to this app.
    const callback = parseExternalUrl(value);
    if (parsed.hostname !== "www.linkedin.com" || parsed.pathname !== "/oauth/v2/authorization" || key !== "redirect_uri"
      || !callback || callback.protocol !== "https:" || callback.pathname !== "/api/personal-connectors/linkedin/oauth/callback" || callback.search || callback.hash
      || !appUrls.some(source => { const app = parseExternalUrl(normalizeRemoteUrl(source)); return app && app.origin === callback.origin; })) return true;
  }
  return false;
}

/**
 * @param {string} url
 * @param {{ appUrls?: string[], extraHosts?: string[] }} [opts]
 */
function isAllowedExternalUrl(url, opts = {}) {
  const parsed = parseExternalUrl(url);
  if (!parsed) return false;
  const host = parsed.hostname.toLowerCase();
  let decodedPath;
  try { decodedPath = decodeURIComponent(parsed.pathname); } catch { return false; }
  // OAuth hosts cannot inherit a broad configured-host/subdomain exception.
  if (["accounts.google.com", "www.dropbox.com", "login.microsoftonline.com"].includes(host) || /^(?:www\.)?github\.com$/.test(host) && decodedPath.startsWith("/login/")) {
    return isAllowedOAuthUrl(parsed, opts.appUrls || []);
  }

  if (isAllowedAppUrl(url, opts.appUrls)) return true;
  if (url.length > 2048 || parsed.protocol !== "https:" || parsed.port || hasUnsafeFragment(parsed)) return false;
  if ([...parsed.searchParams.keys()].some(key => privateParameters.test(key)) || hasUnsafeRedirect(parsed, opts.appUrls || [])) return false;

  // Personal LinkedIn handoffs always use its canonical HTTPS surface.
  // Do not inherit the broad subdomain rule used by configured app hosts.
  if (host === "www.linkedin.com") return true;

  const allowed = new Set();
  for (const extra of opts.extraHosts || []) {
    const h = String(extra || "")
      .trim()
      .toLowerCase();
    if (h) allowed.add(h);
  }

  return allowed.has(host);
}

module.exports = {
  normalizeRemoteUrl,
  hostFromUrl,
  collectAllowedHosts,
  isAllowedAppUrl,
  isAllowedExternalUrl,
};
