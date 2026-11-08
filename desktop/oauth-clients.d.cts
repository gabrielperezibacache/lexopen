export type DistributedOAuthProfile = Readonly<{
  schemaVersion: 1;
  google?: Readonly<{ type: "installed"; client_id: string; client_secret: string }>;
  github?: Readonly<{ type: "device"; client_id: string }>;
  dropbox?: Readonly<{ type: "public_client"; client_id: string }>;
  microsoft?: Readonly<{ type: "public_client"; client_id: string }>;
}>;
export const DISTRIBUTED_OAUTH_ENV: "ALTAZOR_DISTRIBUTED_OAUTH";
export const MAX_DISTRIBUTED_OAUTH_BYTES: 16384;
export function parseDistributedOAuthProfile(raw: unknown): DistributedOAuthProfile;
export function requirePublishableOAuthProviders(providers: unknown): readonly ("google" | "github" | "dropbox" | "microsoft")[];
export function applyDistributedOAuthProfile(file: string | null | undefined, targetEnv?: Record<string, string | undefined>): DistributedOAuthProfile | null;
