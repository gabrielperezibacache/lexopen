import { decryptSecret, encryptSecret } from "@/lib/pjud/secret";
import {
  googleMailboxConfigured,
  googleMailboxRedirectUri,
  microsoftMailboxConfigured,
  microsoftMailboxRedirectUri,
} from "@/lib/mail/types";

type TokenSet = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  email?: string;
};

export function getGmailMailboxAuthUrl(state: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId || !googleMailboxConfigured()) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleMailboxRedirectUri(),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/gmail.readonly",
    ].join(" "),
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function getMicrosoftMailboxAuthUrl(state: string) {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  if (!clientId || !microsoftMailboxConfigured()) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: microsoftMailboxRedirectUri(),
    response_type: "code",
    response_mode: "query",
    scope: "offline_access User.Read Mail.Read",
    state,
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
}

export async function exchangeGmailMailboxCode(code: string): Promise<TokenSet> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET no configurados");
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: googleMailboxRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed (${res.status})`);
  }
  const tokens = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  let email: string | undefined;
  try {
    const profile = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (profile.ok) {
      const body = (await profile.json()) as { email?: string };
      email = body.email;
    }
  } catch {
    /* ignore */
  }
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    email,
  };
}

export async function exchangeMicrosoftMailboxCode(code: string): Promise<TokenSet> {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET no configurados");
  }
  const res = await fetch(
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: microsoftMailboxRedirectUri(),
        grant_type: "authorization_code",
      }),
    }
  );
  if (!res.ok) {
    throw new Error(`Microsoft token exchange failed (${res.status})`);
  }
  const tokens = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  let email: string | undefined;
  try {
    const profile = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (profile.ok) {
      const body = (await profile.json()) as { mail?: string; userPrincipalName?: string };
      email = body.mail || body.userPrincipalName;
    }
  } catch {
    /* ignore */
  }
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    email,
  };
}

export async function refreshGmailAccess(refreshEnc: string): Promise<TokenSet> {
  const refresh = decryptSecret(refreshEnc, { strict: true });
  if (!refresh) throw new Error("Refresh token Gmail inválido. Reconecte.");
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET no configurados");
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error("No se pudo renovar el token de Gmail. Reconecte.");
  const tokens = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  return {
    accessToken: tokens.access_token,
    refreshToken: refresh,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
  };
}

export async function refreshMicrosoftAccess(refreshEnc: string): Promise<TokenSet> {
  const refresh = decryptSecret(refreshEnc, { strict: true });
  if (!refresh) throw new Error("Refresh token Microsoft inválido. Reconecte.");
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET no configurados");
  }
  const res = await fetch(
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refresh,
        grant_type: "refresh_token",
      }),
    }
  );
  if (!res.ok) throw new Error("No se pudo renovar el token de Microsoft. Reconecte.");
  const tokens = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || refresh,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
  };
}

export function encryptOauthToken(value: string) {
  return encryptSecret(value);
}

export async function mailboxAccessToken(account: {
  protocol: string;
  oauthAccessEnc: string | null;
  oauthRefreshEnc: string | null;
  oauthExpiresAt: Date | null;
}): Promise<{
  accessToken: string;
  accessEnc?: string;
  refreshEnc?: string;
  expiresAt?: Date;
}> {
  const fresh =
    account.oauthAccessEnc &&
    account.oauthExpiresAt &&
    account.oauthExpiresAt.getTime() > Date.now() + 60_000
      ? decryptSecret(account.oauthAccessEnc, { strict: true })
      : undefined;
  if (fresh) return { accessToken: fresh };
  if (!account.oauthRefreshEnc) {
    throw new Error("OAuth no conectado. Reconecte el buzón.");
  }
  const next =
    account.protocol === "microsoft"
      ? await refreshMicrosoftAccess(account.oauthRefreshEnc)
      : await refreshGmailAccess(account.oauthRefreshEnc);
  return {
    accessToken: next.accessToken,
    accessEnc: encryptOauthToken(next.accessToken),
    refreshEnc: next.refreshToken ? encryptOauthToken(next.refreshToken) : undefined,
    expiresAt: next.expiresAt,
  };
}
