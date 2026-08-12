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
  hosts.add("::1");
  return hosts;
}

/**
 * @param {string} url
 * @param {{ appUrls?: string[], extraHosts?: string[] }} [opts]
 */
function isAllowedExternalUrl(url, opts = {}) {
  if (typeof url !== "string" || url.length > 2048) return false;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  if (parsed.username || parsed.password) return false;

  const host = parsed.hostname.toLowerCase();
  const allowed = collectAllowedHosts(opts.appUrls || []);
  for (const extra of opts.extraHosts || []) {
    const h = String(extra || "")
      .trim()
      .toLowerCase();
    if (h) allowed.add(h);
  }

  if (allowed.has(host)) return true;
  // Permit subdomains of configured app hosts (e.g. docs.example.com).
  for (const allowedHost of allowed) {
    if (allowedHost && host.endsWith(`.${allowedHost}`)) return true;
  }
  return false;
}

module.exports = {
  normalizeRemoteUrl,
  hostFromUrl,
  collectAllowedHosts,
  isAllowedExternalUrl,
};
