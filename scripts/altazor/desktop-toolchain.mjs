/** Required real-container checks for the LexOpen desktop tools profile. */
export const desktopToolchainChecks = Object.freeze([
  "docx", "libreoffice-pdf", "pdf-pages", "semantic-office-text", "semantic-pdf-text", "ocr-spa-eng",
  "xlsx", "epub", "bibliography", "local-search", "audio-16khz", "lexopen-wallpaper",
]);

/** @param {unknown} value */
export function desktopToolchainVerified(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const { ok, checks } = /** @type {{ ok?: unknown, checks?: unknown }} */ (value);
  return ok === true && Array.isArray(checks) && checks.every(check => typeof check === "string") &&
    new Set(checks).size === checks.length && desktopToolchainChecks.every(check => checks.includes(check));
}
