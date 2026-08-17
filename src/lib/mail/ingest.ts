import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/pjud/secret";
import { fetchImapMessages } from "@/lib/mail/imap";
import { parseMailContent } from "@/lib/mail/parse";
import { causaMailWhere } from "@/lib/mail/access";

export type IngestSource = "demo" | "imap" | "paste";

const DEMO_MESSAGES = [
  {
    externalId: "demo-resolucion-1",
    subject: "Notificación resolución C-4500-2024",
    fromAddress: "notificaciones@pjud.cl",
    bodyText:
      "Tribunal: 14° Juzgado Civil de Santiago\nRIT C-4500-2024\nResolución: Téngase por acompañado documento de fs. 12.",
  },
  {
    externalId: "demo-tablas-1",
    subject: "Horario de tablas — Corte de Apelaciones",
    fromAddress: "tablas@corte.cl",
    bodyText:
      "Causa C-4500-2024 en tabla para el 25/08/2026 sala 2\nTribunal: 14° Juzgado Civil de Santiago",
  },
];

export async function ensureMailboxAccount(userId: string) {
  return prisma.mailboxAccount.upsert({
    where: { userId },
    create: { userId, protocol: "demo" },
    update: {},
  });
}

async function persistRawMessage(
  user: Pick<User, "id" | "role">,
  accountId: string,
  raw: {
    externalId: string;
    subject: string;
    fromAddress?: string;
    receivedAt: Date;
    bodyText: string;
  }
) {
  const parsed = parseMailContent(raw.subject, raw.bodyText);
  const existing = raw.externalId
    ? await prisma.mailboxMessage.findUnique({
        where: {
          userId_externalId: { userId: user.id, externalId: raw.externalId },
        },
      })
    : null;
  if (existing) return { created: false, message: existing };

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
      subject: raw.subject,
      fromAddress: raw.fromAddress,
      receivedAt: raw.receivedAt,
      bodyText: raw.bodyText,
      parsedJson: JSON.stringify(parsed),
      rit: parsed.rit,
      tribunal: parsed.tribunal,
      causaId,
      status: causaId ? "vinculado" : "nuevo",
    },
  });
  return { created: true, message };
}

export async function ingestDemoMail(user: Pick<User, "id" | "role">) {
  const account = await ensureMailboxAccount(user.id);
  let inserted = 0;
  for (const demo of DEMO_MESSAGES) {
    const { created } = await persistRawMessage(user, account.id, {
      ...demo,
      receivedAt: new Date(),
    });
    if (created) inserted += 1;
  }
  await prisma.mailboxAccount.update({
    where: { id: account.id },
    data: { lastSyncAt: new Date() },
  });
  return { inserted, protocol: account.protocol };
}

export async function ingestPasteMail(
  user: Pick<User, "id" | "role">,
  input: { subject: string; body: string; fromAddress?: string }
) {
  const account = await ensureMailboxAccount(user.id);
  const externalId = `paste:${Date.now()}:${input.subject.slice(0, 40)}`;
  const { created, message } = await persistRawMessage(user, account.id, {
    externalId,
    subject: input.subject.trim() || "(pegado)",
    fromAddress: input.fromAddress,
    receivedAt: new Date(),
    bodyText: input.body.trim(),
  });
  return { created, message };
}

export async function ingestImapMail(user: Pick<User, "id" | "role">) {
  const account = await prisma.mailboxAccount.findUnique({
    where: { userId: user.id },
  });
  if (!account || account.protocol !== "imap") {
    throw new Error("Cuenta IMAP no configurada");
  }
  const password = decryptSecret(account.passwordEnc, { strict: true });
  if (!password || !account.imapHost || !account.email) {
    throw new Error("Credenciales IMAP incompletas");
  }
  const raws = await fetchImapMessages({
    host: account.imapHost,
    port: account.imapPort,
    tls: account.imapTls,
    user: account.email,
    password,
    limit: 30,
  });
  let inserted = 0;
  for (const raw of raws) {
    const { created } = await persistRawMessage(user.id, account.id, raw);
    if (created) inserted += 1;
  }
  await prisma.mailboxAccount.update({
    where: { id: account.id },
    data: { lastSyncAt: new Date() },
  });
  return { inserted, protocol: "imap" };
}

export async function syncMailboxForUser(
  user: Pick<User, "id" | "role">,
  source?: IngestSource
) {
  const account = await prisma.mailboxAccount.findUnique({
    where: { userId: user.id },
  });
  const protocol = source || account?.protocol || "demo";
  if (protocol === "imap") return ingestImapMail(user);
  return ingestDemoMail(user);
}

export function encryptMailboxPassword(password: string) {
  return encryptSecret(password);
}

export async function listCausasForMail(user: Pick<User, "id" | "role">) {
  return prisma.causa.findMany({
    where: causaMailWhere(user),
    select: { id: true, titulo: true, rit: true, tribunal: true, proximaTabla: true },
    orderBy: { updatedAt: "desc" },
    take: 40,
  });
}
