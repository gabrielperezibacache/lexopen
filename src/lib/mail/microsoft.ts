import { mailboxAccessToken } from "@/lib/mail/oauth";
import type { InboundMail, ProviderFetchResult } from "@/lib/mail/types";

type MsAccount = {
  protocol: string;
  oauthAccessEnc: string | null;
  oauthRefreshEnc: string | null;
  oauthExpiresAt: Date | null;
};

type GraphList = {
  value?: Array<{
    id: string;
    subject?: string;
    from?: { emailAddress?: { address?: string } };
    receivedDateTime?: string;
    internetMessageId?: string;
  }>;
  "@odata.nextLink"?: string;
};

export async function fetchMicrosoftPjudMessages(
  account: MsAccount
): Promise<
  ProviderFetchResult & { accessEnc?: string; refreshEnc?: string; expiresAt?: Date }
> {
  const token = await mailboxAccessToken(account);
  const messages: InboundMail[] = [];
  let url =
    "https://graph.microsoft.com/v1.0/me/messages?$search=%22from:pjud.cl%22&$select=id,subject,from,receivedDateTime,internetMessageId&$top=40";
  let pages = 0;

  while (url && pages < 3) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        ConsistencyLevel: "eventual",
      },
    });
    if (!res.ok) {
      throw new Error(`Microsoft Graph ${res.status}. Revise Mail.Read.`);
    }
    const list = (await res.json()) as GraphList;
    for (const item of list.value || []) {
      const mimeRes = await fetch(
        `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(item.id)}/$value`,
        { headers: { Authorization: `Bearer ${token.accessToken}` } }
      );
      if (!mimeRes.ok) continue;
      const mime = Buffer.from(await mimeRes.arrayBuffer());
      messages.push({
        externalId: item.internetMessageId || `graph:${item.id}`,
        subject: item.subject || "(sin asunto)",
        fromAddress: item.from?.emailAddress?.address,
        receivedAt: item.receivedDateTime
          ? new Date(item.receivedDateTime)
          : new Date(),
        mime,
      });
    }
    url = list["@odata.nextLink"] || "";
    pages += 1;
  }

  return {
    messages,
    accessEnc: token.accessEnc,
    refreshEnc: token.refreshEnc,
    expiresAt: token.expiresAt,
  };
}
