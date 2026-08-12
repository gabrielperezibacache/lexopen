import { ensureGoogleAccessToken, getGoogleConfig } from "@/lib/integrations/google";

function toBase64Url(input: string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/**
 * Send email via Gmail API using the estudio's connected Google OAuth.
 */
export async function sendGmailMessage(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) {
  let config = await getGoogleConfig();
  if (!config?.accessToken) {
    throw new Error("Google/Gmail no conectado");
  }
  config = await ensureGoogleAccessToken();
  if (!config.accessToken) {
    throw new Error("No hay access token de Google");
  }

  const boundary = `lexopen_${Date.now()}`;
  const mime = opts.html
    ? [
        `To: ${opts.to}`,
        `Subject: =?UTF-8?B?${Buffer.from(opts.subject).toString("base64")}?=`,
        "MIME-Version: 1.0",
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        "",
        `--${boundary}`,
        'Content-Type: text/plain; charset="UTF-8"',
        "",
        opts.text,
        `--${boundary}`,
        'Content-Type: text/html; charset="UTF-8"',
        "",
        opts.html,
        `--${boundary}--`,
        "",
      ].join("\r\n")
    : [
        `To: ${opts.to}`,
        `Subject: =?UTF-8?B?${Buffer.from(opts.subject).toString("base64")}?=`,
        "MIME-Version: 1.0",
        'Content-Type: text/plain; charset="UTF-8"',
        "",
        opts.text,
      ].join("\r\n");

  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: toBase64Url(mime) }),
      signal: AbortSignal.timeout(30_000),
      redirect: "error",
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gmail send HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}
