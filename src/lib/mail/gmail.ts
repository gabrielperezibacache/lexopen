import { mailboxAccessToken } from "@/lib/mail/oauth";
import type { InboundMail, ProviderFetchResult } from "@/lib/mail/types";

type GmailAccount = {
  protocol: string;
  oauthAccessEnc: string | null;
  oauthRefreshEnc: string | null;
  oauthExpiresAt: Date | null;
  gmailHistoryId: string | null;
};

type GmailListResponse = {
  messages?: Array<{ id: string }>;
  nextPageToken?: string;
  historyId?: string;
};

function decodeGmailRaw(raw: string) {
  const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64");
}

async function gmailGetRaw(accessToken: string, id: string) {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=raw`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return null;
  const body = (await res.json()) as { raw?: string; historyId?: string };
  if (!body.raw) return null;
  return { mime: decodeGmailRaw(body.raw), historyId: body.historyId };
}

export async function fetchGmailPjudMessages(
  account: GmailAccount
): Promise<
  ProviderFetchResult & { accessEnc?: string; refreshEnc?: string; expiresAt?: Date }
> {
  const token = await mailboxAccessToken(account);
  const messages: InboundMail[] = [];
  let pageToken: string | undefined;
  let historyId = account.gmailHistoryId || undefined;
  let pages = 0;

  do {
    const params = new URLSearchParams({
      q: "from:pjud.cl",
      maxResults: "40",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
      { headers: { Authorization: `Bearer ${token.accessToken}` } }
    );
    if (!res.ok) {
      throw new Error(`Gmail API ${res.status}. Revise el alcance gmail.readonly.`);
    }
    const list = (await res.json()) as GmailListResponse;
    if (list.historyId) historyId = list.historyId;
    for (const item of list.messages || []) {
      const raw = await gmailGetRaw(token.accessToken, item.id);
      if (!raw) continue;
      messages.push({
        externalId: `gmail:${item.id}`,
        subject: "(gmail)",
        receivedAt: new Date(),
        mime: raw.mime,
        gmailHistoryId: raw.historyId,
      });
    }
    pageToken = list.nextPageToken;
    pages += 1;
  } while (pageToken && pages < 3);

  return {
    messages,
    gmailHistoryId: historyId,
    accessEnc: token.accessEnc,
    refreshEnc: token.refreshEnc,
    expiresAt: token.expiresAt,
  };
}
