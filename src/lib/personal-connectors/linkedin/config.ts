import { encryptionKey, ConnectorError } from "../core";

export type LinkedInConfig = { configured: boolean; clientId: string; clientSecret: string; redirectUri: string; shareEnabled: boolean; reason: string | null };
export function linkedInConfig(env: Readonly<Record<string, string | undefined>> = process.env): LinkedInConfig {
  const clientId = env.LINKEDIN_CLIENT_ID?.trim() || "", clientSecret = env.LINKEDIN_CLIENT_SECRET?.trim() || "", redirectUri = env.LINKEDIN_REDIRECT_URI?.trim() || "";
  let reason: string | null = null;
  if (!clientId || !clientSecret || !redirectUri) reason = "LinkedIn requiere una aplicación registrada y una dirección de retorno HTTPS configurada por el administrador del Host.";
  else {
    try {
      const url = new URL(redirectUri);
      if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/api/personal-connectors/linkedin/oauth/callback") throw new Error();
      encryptionKey(env.SESSION_SECRET);
    } catch { reason = "Revise la dirección HTTPS registrada y la configuración segura del Host antes de conectar LinkedIn."; }
  }
  return { configured: !reason, clientId, clientSecret, redirectUri, shareEnabled: env.LINKEDIN_SHARE_ENABLED === "1", reason };
}
export function requireLinkedInConfig() {
  const config = linkedInConfig();
  if (!config.configured) throw new ConnectorError("linkedin_unconfigured", config.reason!, 503);
  return config;
}
