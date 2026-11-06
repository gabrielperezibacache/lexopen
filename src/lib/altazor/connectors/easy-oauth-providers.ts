export const EASY_OAUTH_PROVIDERS = ["google", "github", "dropbox"] as const;
export type EasyOAuthProvider = typeof EASY_OAUTH_PROVIDERS[number];

export const EASY_OAUTH_CONNECTOR = { google: "google-workspace", github: "github", dropbox: "dropbox" } as const satisfies Record<EasyOAuthProvider, string>;
