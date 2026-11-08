import type { EasyOAuthProvider } from "./easy-oauth-providers";

export type EasyOAuthAccess = "basic" | "files";
export const GOOGLE_METADATA_SCOPE = "https://www.googleapis.com/auth/drive.metadata.readonly";
export const GOOGLE_FILES_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const basicScopes = {
  google: [GOOGLE_METADATA_SCOPE],
  github: ["read:user"],
  dropbox: ["account_info.read", "files.content.read", "files.metadata.read"],
  microsoft: ["Files.Read", "User.Read"],
} as const;

/** Each permission upgrade is explicit and bound to its own OAuth attempt. */
export function easyOAuthScopes(provider: EasyOAuthProvider, access: EasyOAuthAccess = "basic"): string[] {
  if (access === "files") {
    if (provider !== "google") throw new Error("unsupported_oauth_access");
    return [GOOGLE_FILES_SCOPE];
  }
  if (access !== "basic") throw new Error("unsupported_oauth_access");
  return [...basicScopes[provider]];
}

export function validEasyOAuthScopes(provider: EasyOAuthProvider, value: unknown): value is string[] {
  if (!Array.isArray(value) || value.some(scope => typeof scope !== "string")) return false;
  return (["basic", ...(provider === "google" ? ["files"] : [])] as EasyOAuthAccess[]).some(access => {
    const expected = easyOAuthScopes(provider, access);
    return value.length === expected.length && new Set(value).size === value.length && expected.every(scope => value.includes(scope));
  });
}

export function canReadConnectorFiles(provider: EasyOAuthProvider, scopes: readonly string[]) {
  return provider === "google" ? scopes.includes(GOOGLE_FILES_SCOPE) : provider === "github" ? scopes.includes("read:user") : provider === "microsoft" ? scopes.includes("Files.Read") : scopes.includes("files.content.read");
}
