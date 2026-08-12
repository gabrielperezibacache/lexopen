/**
 * Confine Obsidian vault paths under OBSIDIAN_VAULT_PATH / data dir.
 */

import path from "path";

export function defaultObsidianVaultRoot() {
  const explicit = process.env.OBSIDIAN_VAULT_PATH?.trim();
  if (explicit) return path.resolve(explicit);
  const dataDir = process.env.LEXOPEN_DATA_DIR?.trim();
  if (dataDir) return path.resolve(dataDir, "obsidian-vault");
  return path.resolve(process.cwd(), "obsidian-vault");
}

function rejectTraversalSegments(segments: string[]) {
  for (const seg of segments) {
    if (!seg || seg === "." || seg === ".." || seg.includes("\0")) {
      throw Object.assign(new Error("Ruta Obsidian inválida"), { status: 400 });
    }
  }
}

/** Ensure vaultPath resolves under the configured vault root. */
export function assertAllowedVaultPath(vaultPath: string) {
  const root = defaultObsidianVaultRoot();
  const full = path.resolve(vaultPath.trim());
  if (full !== root && !full.startsWith(`${root}${path.sep}`)) {
    throw Object.assign(
      new Error(
        `vaultPath debe estar bajo ${root}. Ajuste OBSIDIAN_VAULT_PATH o use esa ruta.`
      ),
      { status: 400 }
    );
  }
  return full;
}

export function sanitizeVaultFolderPrefix(prefix: string) {
  const cleaned = String(prefix || "LexOpen")
    .replace(/\\/g, "/")
    .split("/")
    .map((seg) => seg.trim())
    .filter(Boolean);
  rejectTraversalSegments(cleaned);
  const safe = cleaned
    .map((seg) => seg.replace(/[<>:"|?*]/g, "-").replace(/\.\./g, "-"))
    .filter(Boolean);
  return safe.join("/") || "LexOpen";
}

/** Resolve a relative path under a vault root; rejects escapes. */
export function resolveUnderVault(vaultPath: string, ...parts: string[]) {
  const root = assertAllowedVaultPath(vaultPath);
  const relative = parts
    .join("/")
    .replace(/\\/g, "/")
    .split("/")
    .map((seg) => seg.trim())
    .filter(Boolean);
  rejectTraversalSegments(relative);
  const full = path.resolve(root, ...relative);
  if (full !== root && !full.startsWith(`${root}${path.sep}`)) {
    throw Object.assign(new Error("Ruta Obsidian fuera del vault"), {
      status: 400,
    });
  }
  return full;
}
