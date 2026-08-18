export const IMAP_PRESETS = [
  { id: "gmail", label: "Gmail", host: "imap.gmail.com", port: 993, tls: true },
  { id: "yahoo", label: "Yahoo", host: "imap.mail.yahoo.com", port: 993, tls: true },
  { id: "icloud", label: "iCloud", host: "imap.mail.me.com", port: 993, tls: true },
  { id: "custom", label: "IMAP personalizado", host: "", port: 993, tls: true },
] as const;

export type MailboxProtocol = "gmail" | "microsoft" | "imap";
export type MailboxAccountStatus = "disconnected" | "connected" | "error";

export type InboundMail = {
  externalId: string;
  subject: string;
  fromAddress?: string;
  replyTo?: string;
  returnPath?: string;
  receivedAt: Date;
  mime: Buffer;
  imapUid?: number;
  gmailHistoryId?: string;
};

export type ProviderFetchResult = {
  messages: InboundMail[];
  imapUidValidity?: number;
  imapLastUid?: number;
  gmailHistoryId?: string;
  graphDeltaLink?: string;
};

export type PublicMailboxAccount = {
  protocol: string;
  status: string;
  email: string | null;
  imapHost: string | null;
  imapPort: number;
  imapTls: boolean;
  hasPassword: boolean;
  hasOauth: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  googleConfigured: boolean;
  microsoftConfigured: boolean;
  presets: typeof IMAP_PRESETS;
};

export function googleMailboxConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function microsoftMailboxConfigured() {
  return Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
}

export function googleMailboxRedirectUri() {
  if (process.env.GOOGLE_MAIL_REDIRECT_URI?.trim()) {
    return process.env.GOOGLE_MAIL_REDIRECT_URI.trim();
  }
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (base) return `${base}/api/mail/google/callback`;
  return "http://localhost:3000/api/mail/google/callback";
}

export function microsoftMailboxRedirectUri() {
  if (process.env.MICROSOFT_REDIRECT_URI?.trim()) {
    return process.env.MICROSOFT_REDIRECT_URI.trim();
  }
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (base) return `${base}/api/mail/microsoft/callback`;
  return "http://localhost:3000/api/mail/microsoft/callback";
}

export type PublicMailboxAttachment = {
  filename: string;
  mimeType: string | null;
  sizeBytes: number;
  documentoId: string | null;
};

export type PublicMailboxMessage = {
  id: string;
  subject: string;
  kind: string;
  status: string;
  rit: string | null;
  tribunal: string | null;
  fromAddress: string | null;
  receivedAt: string;
  bodyText: string;
  causaId: string | null;
  causa: { id: string; titulo: string; rit: string | null } | null;
  attachments: PublicMailboxAttachment[];
};

export function publicMailboxMessage(message: {
  id: string;
  subject: string;
  kind: string;
  status: string;
  rit: string | null;
  tribunal: string | null;
  fromAddress: string | null;
  receivedAt: Date;
  bodyText: string;
  causaId: string | null;
  causa?: { id: string; titulo: string; rit: string | null } | null;
  attachments?: Array<{
    filename: string;
    mimeType: string | null;
    sizeBytes: number;
    documentoId: string | null;
  }>;
}): PublicMailboxMessage {
  return {
    id: message.id,
    subject: message.subject,
    kind: message.kind,
    status: message.status,
    rit: message.rit,
    tribunal: message.tribunal,
    fromAddress: message.fromAddress,
    receivedAt: message.receivedAt.toISOString(),
    bodyText: message.bodyText,
    causaId: message.causaId,
    causa: message.causa || null,
    attachments: (message.attachments || []).map((a) => ({
      filename: a.filename,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      documentoId: a.documentoId,
    })),
  };
}

export function publicMailboxAccount(
  account: {
    protocol: string;
    status: string;
    email: string | null;
    imapHost: string | null;
    imapPort: number;
    imapTls: boolean;
    passwordEnc: string | null;
    oauthRefreshEnc: string | null;
    lastSyncAt: Date | null;
    lastError: string | null;
  } | null
): PublicMailboxAccount {
  return {
    protocol: account?.protocol || "imap",
    status: account?.status || "disconnected",
    email: account?.email || null,
    imapHost: account?.imapHost || null,
    imapPort: account?.imapPort ?? 993,
    imapTls: account?.imapTls ?? true,
    hasPassword: Boolean(account?.passwordEnc),
    hasOauth: Boolean(account?.oauthRefreshEnc),
    lastSyncAt: account?.lastSyncAt?.toISOString() || null,
    lastError: account?.lastError || null,
    googleConfigured: googleMailboxConfigured(),
    microsoftConfigured: microsoftMailboxConfigured(),
    presets: IMAP_PRESETS,
  };
}
