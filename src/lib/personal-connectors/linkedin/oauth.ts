import { createPublicKey, verify, type JsonWebKey } from "node:crypto";
import { actualScopes, ConnectorError, constantEqual, digest } from "../core";
import type { LinkedInConfig } from "./config";

export type LinkedInGrant = { accessToken: string; refreshToken?: string; expiresAt: string; scopes: string[] | null; subject: string; name: string; email: string | null; pictureUrl: string | null };
export type Fetcher = typeof fetch;
const failure = () => new ConnectorError("identity_validation_failed", "LinkedIn no entregó una autorización verificable. Inicie una conexión nueva.", 502);
export async function providerJson(url: string, init: RequestInit, fetcher: Fetcher = fetch) {
  const response = await fetcher(url, { ...init, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new ConnectorError(response.status === 401 ? "needs_reconnect" : "provider_rejected", "LinkedIn rechazó la operación. Compruebe los permisos de la aplicación y vuelva a conectar.", response.status === 401 ? 409 : 502);
  const text = await response.text();
  if (text.length > 200_000) throw failure();
  const body: unknown = JSON.parse(text);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw failure();
  return body as Record<string, unknown>;
}
function decode(part: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(part)) throw failure();
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
}
export async function validateIdToken(token: string, clientId: string, nonceHash: string, fetcher: Fetcher = fetch, now = Date.now()) {
  try {
    if (token.length > 20_000) throw failure();
    const parts = token.split("."); if (parts.length !== 3) throw failure();
    const header = decode(parts[0]), claims = decode(parts[1]);
    if (header.alg !== "RS256" || typeof header.kid !== "string" || header.kid.length > 200 || header.jku || header.x5u || header.crit) throw failure();
    const jwks = await providerJson("https://www.linkedin.com/oauth/openid/jwks", {}, fetcher);
    if (!Array.isArray(jwks.keys) || jwks.keys.length > 30) throw failure();
    const keys = jwks.keys.filter(key => key && typeof key === "object" && key.kid === header.kid && key.kty === "RSA" && (!key.alg || key.alg === "RS256") && (!key.use || key.use === "sig"));
    if (keys.length !== 1 || !/^[A-Za-z0-9_-]+$/.test(parts[2])) throw failure();
    const key = createPublicKey({ key: keys[0] as JsonWebKey, format: "jwk" });
    if (!verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], "base64url"))) throw failure();
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (claims.iss !== "https://www.linkedin.com/oauth" || audiences.some(value => typeof value !== "string") || !audiences.includes(clientId) || (audiences.length > 1 && claims.azp !== clientId) || (claims.azp !== undefined && claims.azp !== clientId)) throw failure();
    if (typeof claims.exp !== "number" || !Number.isFinite(claims.exp) || claims.exp * 1000 <= now || typeof claims.iat !== "number" || !Number.isFinite(claims.iat) || claims.iat * 1000 > now + 60_000 || claims.iat >= claims.exp || (claims.nbf !== undefined && (typeof claims.nbf !== "number" || !Number.isFinite(claims.nbf) || claims.nbf * 1000 > now + 60_000))) throw failure();
    if (typeof claims.sub !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(claims.sub) || typeof claims.nonce !== "string" || !constantEqual(digest(claims.nonce), nonceHash)) throw failure();
    return claims.sub;
  } catch { throw failure(); }
}
export function authorizationUrl(config: LinkedInConfig, state: string, nonce: string, publish: boolean) {
  const scopes = ["openid", "profile", ...(publish ? ["w_member_social"] : [])];
  const params = new URLSearchParams({ response_type: "code", client_id: config.clientId, redirect_uri: config.redirectUri, state, nonce, scope: scopes.join(" ") });
  return { url: `https://www.linkedin.com/oauth/v2/authorization?${params}`, scopes };
}
export async function exchangeLinkedInCode(config: LinkedInConfig, code: string, nonceHash: string, fetcher: Fetcher = fetch): Promise<LinkedInGrant> {
  const tokens = await providerJson("https://www.linkedin.com/oauth/v2/accessToken", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", client_id: config.clientId, client_secret: config.clientSecret, code, redirect_uri: config.redirectUri }) }, fetcher);
  if (typeof tokens.access_token !== "string" || !tokens.access_token || tokens.access_token.length > 16_000 || typeof tokens.id_token !== "string" || typeof tokens.expires_in !== "number" || !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0 || tokens.expires_in > 366 * 86400) throw failure();
  const subject = await validateIdToken(tokens.id_token, config.clientId, nonceHash, fetcher);
  const profile = await providerJson("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` } }, fetcher);
  if (profile.sub !== subject || typeof profile.name !== "string" || !profile.name.trim()) throw failure();
  return { accessToken: tokens.access_token, ...(typeof tokens.refresh_token === "string" ? { refreshToken: tokens.refresh_token } : {}), expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(), scopes: actualScopes(tokens.scope), subject, name: profile.name.slice(0, 200), email: typeof profile.email === "string" ? profile.email.slice(0, 254) : null, pictureUrl: null };
}
