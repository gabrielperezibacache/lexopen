import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/pjud/secret";
import { fetchImapMessages } from "@/lib/mail/imap";
import { parseMailContent } from "@/lib/mail/parse";
import { causaMailWhere } from "@/lib/mail/access";
import { messageIsFromPjud } from "@/lib/mail/pjud-sender";
import { parseMimeBuffer, type ParsedMailAttachment } from "@/lib/mail/mime";
import { fetchGmailPjudMessages } from "@/lib/mail/gmail";
import { fetchMicrosoftPjudMessages } from "@/lib/mail/microsoft";
import { encryptOauthToken } from "@/lib/mail/oauth";
import {
  attachmentSha256,
  fileMailboxMessageToCausa,
  isArchivableAttachment,
} from "@/lib/mail/file-to-folders";
import { newStorageKey, putObject } from "@/lib/storage";
import type { InboundMail, MailboxProtocol, ProviderFetchResult } from "@/lib/mail/types";

export async function ensureMailboxAccount(userId: string) {
  return prisma.mailboxAccount.upsert({
    where: { userId },
    create: { userId, protocol: "imap", status: "disconnected" },
    update: {},
  });
}

async function stashAttachments(
  messageId: string,
  attachments: ParsedMailAttachment[]
) {
  const stored: ParsedMailAttachment[] = [];
  for (const att of attachments) {
    if (!isArchivableAttachment(att)) continue;
    const sha = attachmentSha256(att.content);
    const existing = await prisma.mailboxAttachment.findUnique({
      where: { messageId_sha256: { messageId, sha256: sha } },
    });
    if (existing) {
      stored.push(att);
      continue;
    }
    const key = newStorageKey(`correo/inbox/${messageId}`, att.filename);
    await putObject({ key, body: att.content, contentType: att.mimeType });
    await prisma.mailboxAttachment.create({
      data: {
        messageId,
        filename: att.filename,
        mimeType: att.mimeType,
        sha256: sha,
        sizeBytes: att.content.byteLength,
        storageKey: key,
      },
    });
    stored.push(att);
  }
  return stored;
}

export async function persistInboundMessage(
  user: Pick<User, "id" | "role">,
  accountId: string,
  raw: InboundMail,
  opts?: { requirePjudSender?: boolean }
) {
  const mime = await parseMimeBuffer(raw.mime);
  const fromAddress = mime.fromAddress || raw.fromAddress;
  if (
    opts?.requirePjudSender !== false &&
    !messageIsFromPjud({
      fromAddress,
      replyTo: mime.replyTo || raw.replyTo,
      returnPath: mime.returnPath || raw.returnPath,
    })
  ) {
    return { created: false, skipped: "not_pjud" as const, message: null };
  }

  const subject = mime.subject || raw.subject;
  const bodyText = mime.bodyText || subject;
  const parsed = parseMailContent(subject, bodyText);
  const existing = raw.externalId
    ? await prisma.mailboxMessage.findUnique({
        where: {
          userId_externalId: { userId: user.id, externalId: raw.externalId },
        },
      })
    : null;
  if (existing) return { created: false, skipped: "duplicate" as const, message: existing };

  let causaId: string | undefined;
  if (parsed.rit) {
    const match = await prisma.causa.findFirst({
      where: { rit: parsed.rit, ...causaMailWhere(user) },
      select: { id: true },
    });
    causaId = match?.id;
  }

  const message = await prisma.mailboxMessage.create({
    data: {
      userId: user.id,
      accountId,
      externalId: raw.externalId,
      kind: parsed.kind,
      subject,
      fromAddress,
      receivedAt: mime.receivedAt || raw.receivedAt,
      bodyText,
      parsedJson: JSON.stringify(parsed),
      rit: parsed.rit,
      tribunal: parsed.tribunal,
      causaId,
      status: causaId ? "vinculado" : "nuevo",
    },
  });

  const stored = await stashAttachments(message.id, mime.attachments);
  if (causaId) {
    try {
      await fileMailboxMessageToCausa(user, message.id, causaId, stored);
    } catch (e) {
      console.error("mail.auto-file", e);
    }
  }
  return { created: true, skipped: null, message };
}

export async function ingestPasteMail(
  user: Pick<User, "id" | "role">,
  input: { subject: string; body: string; fromAddress?: string }
) {
  const account = await ensureMailboxAccount(user.id);
  const externalId = `paste:${Date.now()}:${input.subject.slice(0, 40)}`;
  const text = `From: ${input.fromAddress || "paste@local"}\nSubject: ${input.subject}\n\n${input.body}`;
  return persistInboundMessage(
    user,
    account.id,
    {
      externalId,
      subject: input.subject.trim() || "(pegado)",
      fromAddress: input.fromAddress,
      receivedAt: new Date(),
      mime: Buffer.from(text, "utf8"),
    },
    { requirePjudSender: false }
  );
}

async function saveProviderCursor(
  accountId: string,
  patch: {
    accessEnc?: string;
    refreshEnc?: string;
    expiresAt?: Date;
    gmailHistoryId?: string;
    graphDeltaLink?: string;
    imapUidValidity?: number;
    imapLastUid?: number;
  }
) {
  await prisma.mailboxAccount.update({
    where: { id: accountId },
    data: {
      ...(patch.accessEnc ? { oauthAccessEnc: patch.accessEnc } : {}),
      ...(patch.refreshEnc ? { oauthRefreshEnc: patch.refreshEnc } : {}),
      ...(patch.expiresAt ? { oauthExpiresAt: patch.expiresAt } : {}),
      ...(patch.gmailHistoryId ? { gmailHistoryId: patch.gmailHistoryId } : {}),
      ...(patch.graphDeltaLink ? { graphDeltaLink: patch.graphDeltaLink } : {}),
      ...(patch.imapUidValidity != null
        ? { imapUidValidity: patch.imapUidValidity }
        : {}),
      ...(patch.imapLastUid != null ? { imapLastUid: patch.imapLastUid } : {}),
      lastSyncAt: new Date(),
      lastError: null,
      status: "connected",
    },
  });
}

async function ingestFetched(
  user: Pick<User, "id" | "role">,
  accountId: string,
  fetched: ProviderFetchResult
) {
  let inserted = 0;
  for (const raw of fetched.messages) {
    const { created } = await persistInboundMessage(user, accountId, raw);
    if (created) inserted += 1;
  }
  return inserted;
}

export async function ingestImapMail(user: Pick<User, "id" | "role">) {
  const account = await prisma.mailboxAccount.findUnique({
    where: { userId: user.id },
  });
  if (!account || account.protocol !== "imap" || account.status === "disconnected") {
    throw Object.assign(new Error("Cuenta IMAP no configurada"), { status: 400 });
  }
  const password = decryptSecret(account.passwordEnc, { strict: true });
  if (!password || !account.imapHost || !account.email) {
    throw Object.assign(new Error("Credenciales IMAP incompletas"), { status: 400 });
  }
  const fetched = await fetchImapMessages({
    host: account.imapHost,
    port: account.imapPort,
    tls: account.imapTls,
    user: account.email,
    password,
    uidValidity: account.imapUidValidity,
    lastUid: account.imapLastUid,
  });
  const inserted = await ingestFetched(user, account.id, fetched);
  await saveProviderCursor(account.id, {
    imapUidValidity: fetched.imapUidValidity,
    imapLastUid: fetched.imapLastUid,
  });
  return { inserted, protocol: "imap" as const, skipped: false as const };
}

export async function ingestGmailMail(user: Pick<User, "id" | "role">) {
  const account = await prisma.mailboxAccount.findUnique({
    where: { userId: user.id },
  });
  if (!account || account.protocol !== "gmail") {
    throw Object.assign(new Error("Gmail no conectado"), { status: 400 });
  }
  const fetched = await fetchGmailPjudMessages(account);
  const inserted = await ingestFetched(user, account.id, fetched);
  await saveProviderCursor(account.id, {
    accessEnc: fetched.accessEnc,
    refreshEnc: fetched.refreshEnc,
    expiresAt: fetched.expiresAt,
    gmailHistoryId: fetched.gmailHistoryId,
  });
  return { inserted, protocol: "gmail" as const, skipped: false as const };
}

export async function ingestMicrosoftMail(user: Pick<User, "id" | "role">) {
  const account = await prisma.mailboxAccount.findUnique({
    where: { userId: user.id },
  });
  if (!account || account.protocol !== "microsoft") {
    throw Object.assign(new Error("Microsoft no conectado"), { status: 400 });
  }
  const fetched = await fetchMicrosoftPjudMessages(account);
  const inserted = await ingestFetched(user, account.id, fetched);
  await saveProviderCursor(account.id, {
    accessEnc: fetched.accessEnc,
    refreshEnc: fetched.refreshEnc,
    expiresAt: fetched.expiresAt,
    graphDeltaLink: fetched.graphDeltaLink,
  });
  return { inserted, protocol: "microsoft" as const, skipped: false as const };
}

export async function syncMailboxForUser(
  user: Pick<User, "id" | "role">,
  opts?: { fromCron?: boolean }
) {
  const account = await prisma.mailboxAccount.findUnique({
    where: { userId: user.id },
  });
  if (!account || account.status === "disconnected") {
    return { inserted: 0, protocol: account?.protocol || "imap", skipped: true };
  }
  if (opts?.fromCron && account.status !== "connected") {
    return { inserted: 0, protocol: account.protocol, skipped: true };
  }
  const protocol = account.protocol as MailboxProtocol;
  try {
    if (protocol === "gmail") return await ingestGmailMail(user);
    if (protocol === "microsoft") return await ingestMicrosoftMail(user);
    if (protocol === "imap") return await ingestImapMail(user);
    return { inserted: 0, protocol, skipped: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error de sync";
    await prisma.mailboxAccount.update({
      where: { id: account.id },
      data: { status: "error", lastError: message.slice(0, 500) },
    });
    throw e;
  }
}

export function encryptMailboxPassword(password: string) {
  return encryptSecret(password);
}

export { encryptOauthToken };

export async function connectMailboxOauth(
  userId: string,
  protocol: "gmail" | "microsoft",
  tokens: {
    accessToken: string;
    refreshToken?: string;
    expiresAt: Date;
    email?: string;
  }
) {
  if (!tokens.refreshToken) {
    throw Object.assign(
      new Error("El proveedor no entregó refresh token. Reconecte con consentimiento."),
      { status: 400 }
    );
  }
  const account = await ensureMailboxAccount(userId);
  return prisma.mailboxAccount.update({
    where: { id: account.id },
    data: {
      protocol,
      status: "connected",
      email: tokens.email || account.email,
      oauthAccessEnc: encryptOauthToken(tokens.accessToken),
      oauthRefreshEnc: encryptOauthToken(tokens.refreshToken),
      oauthExpiresAt: tokens.expiresAt,
      lastError: null,
      passwordEnc: null,
      imapHost: null,
      imapUidValidity: null,
      imapLastUid: null,
    },
  });
}

export async function disconnectMailboxAccount(userId: string) {
  const account = await prisma.mailboxAccount.findUnique({ where: { userId } });
  if (!account) return null;
  return prisma.mailboxAccount.update({
    where: { id: account.id },
    data: {
      status: "disconnected",
      passwordEnc: null,
      oauthAccessEnc: null,
      oauthRefreshEnc: null,
      oauthExpiresAt: null,
      lastError: null,
      gmailHistoryId: null,
      graphDeltaLink: null,
      imapUidValidity: null,
      imapLastUid: null,
    },
  });
}

export async function listCausasForMail(user: Pick<User, "id" | "role">) {
  return prisma.causa.findMany({
    where: causaMailWhere(user),
    select: { id: true, titulo: true, rit: true, tribunal: true, proximaTabla: true },
    orderBy: { updatedAt: "desc" },
    take: 40,
  });
}
