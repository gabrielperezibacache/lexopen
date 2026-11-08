import type { EasyOAuthProvider } from "./easy-oauth-providers";

export type EasyOAuthAccess = "basic" | "files" | "manage";
export const GOOGLE_METADATA_SCOPE = "https://www.googleapis.com/auth/drive.metadata.readonly";
export const GOOGLE_FILES_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
export const GOOGLE_MANAGE_SCOPE = "https://www.googleapis.com/auth/drive";
const basicScopes = {
  google: [GOOGLE_METADATA_SCOPE],
  github: ["read:user"],
  dropbox: ["account_info.read", "files.content.read", "files.metadata.read"],
  microsoft: ["Files.Read", "User.Read"],
} as const;

/** Each permission upgrade is explicit and bound to its own OAuth attempt. */
export function easyOAuthScopes(provider: EasyOAuthProvider, access: EasyOAuthAccess = "basic"): string[] {
  if (access === "files" || access === "manage") {
    if (provider !== "google") throw new Error("unsupported_oauth_access");
    return [access === "manage" ? GOOGLE_MANAGE_SCOPE : GOOGLE_FILES_SCOPE];
  }
  if (access !== "basic") throw new Error("unsupported_oauth_access");
  return [...basicScopes[provider]];
}

export function validEasyOAuthScopes(provider: EasyOAuthProvider, value: unknown): value is string[] {
  if (!Array.isArray(value) || value.some(scope => typeof scope !== "string")) return false;
  return (["basic", ...(provider === "google" ? ["files", "manage"] : [])] as EasyOAuthAccess[]).some(access => {
    const expected = easyOAuthScopes(provider, access);
    return value.length === expected.length && new Set(value).size === value.length && expected.every(scope => value.includes(scope));
  });
}

export function canReadConnectorFiles(provider: EasyOAuthProvider, scopes: readonly string[]) {
  return provider === "google" ? scopes.includes(GOOGLE_FILES_SCOPE) || canManageConnectorFiles(provider, scopes) : provider === "github" ? scopes.includes("read:user") : provider === "microsoft" ? scopes.includes("Files.Read") : scopes.includes("files.content.read");
}

/** A management grant is exact and never inferred from a read grant. */
export function canManageConnectorFiles(provider: EasyOAuthProvider, scopes: readonly string[]) {
  return provider === "google" && scopes.length === 1 && scopes[0] === GOOGLE_MANAGE_SCOPE;
}
