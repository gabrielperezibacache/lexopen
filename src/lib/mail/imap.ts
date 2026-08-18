import { isPrivateOrLocalHostname } from "@/lib/net/safe-url";
import { IMAP_PRESETS, type InboundMail, type ProviderFetchResult } from "@/lib/mail/types";

export type ImapFetchOpts = {
  host: string;
  port: number;
  tls: boolean;
  user: string;
  password: string;
  limit?: number;
  uidValidity?: number | null;
  lastUid?: number | null;
};

export { IMAP_PRESETS };

export function assertImapHostAllowed(host: string) {
  const trimmed = host.trim().toLowerCase();
  if (!trimmed) {
    throw Object.assign(new Error("Host IMAP requerido"), { status: 400 });
  }
  if (isPrivateOrLocalHostname(trimmed)) {
    throw Object.assign(
      new Error(
        "Host IMAP en red privada o local no permitido (use un proveedor público)"
      ),
      { status: 400 }
    );
  }
  if (
    trimmed === "outlook.office365.com" ||
    trimmed === "imap-mail.outlook.com" ||
    trimmed.endsWith(".office365.com")
  ) {
    throw Object.assign(
      new Error(
        "Outlook/Hotmail no admite IMAP con contraseña. Use el botón Microsoft."
      ),
      { status: 400 }
    );
  }
}

async function loadImapFlow() {
  try {
    const mod = await import("imapflow");
    return mod.ImapFlow;
  } catch {
    throw new Error("IMAP no disponible: falta dependencia imapflow en el Host");
  }
}

export async function probeImapConnection(opts: {
  host: string;
  port: number;
  tls: boolean;
  user: string;
  password: string;
}) {
  assertImapHostAllowed(opts.host);
  const ImapFlow = await loadImapFlow();
  const client = new ImapFlow({
    host: opts.host,
    port: opts.port,
    secure: opts.tls,
    auth: { user: opts.user, pass: opts.password },
    logger: false,
  });
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    lock.release();
  } finally {
    await client.logout().catch(() => undefined);
  }
}

/** Incremental IMAP fetch: FROM pjud.cl, UID cursor (not unseen-only). */
export async function fetchImapMessages(
  opts: ImapFetchOpts
): Promise<ProviderFetchResult> {
  assertImapHostAllowed(opts.host);
  const ImapFlow = await loadImapFlow();
  const client = new ImapFlow({
    host: opts.host,
    port: opts.port,
    secure: opts.tls,
    auth: { user: opts.user, pass: opts.password },
    logger: false,
  });

  const limit = Math.min(Math.max(opts.limit ?? 40, 1), 100);
  const messages: InboundMail[] = [];
  let imapUidValidity: number | undefined;
  let imapLastUid = opts.lastUid ?? 0;

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const mailboxInfo = client.mailbox;
      const validity = Number(
        mailboxInfo && typeof mailboxInfo === "object"
          ? mailboxInfo.uidValidity || 0
          : 0
      );
      imapUidValidity = validity || undefined;
      const resetCursor =
        Boolean(opts.uidValidity) && validity && validity !== opts.uidValidity;
      const minUid = resetCursor ? 0 : opts.lastUid || 0;

      const uids = await client.search({ from: "pjud.cl" }, { uid: true });
      const filtered = (uids || []).filter((uid) => Number(uid) > minUid);
      const slice = filtered.slice(-limit);

      for (const uid of slice) {
        const fetched = await client.fetchOne(
          uid,
          { envelope: true, source: true, internalDate: true },
          { uid: true }
        );
        const msg = fetched && typeof fetched === "object" ? fetched : null;
        if (!msg?.envelope || !msg.source) continue;
        const mime = Buffer.isBuffer(msg.source)
          ? msg.source
          : Buffer.from(msg.source);
        const subject = msg.envelope.subject || "(sin asunto)";
        const fromAddress = msg.envelope.from?.[0]?.address || undefined;
        const receivedAt =
          msg.internalDate instanceof Date
            ? msg.internalDate
            : new Date(msg.internalDate || Date.now());
        const externalId =
          msg.envelope.messageId ||
          `uid:${uid}@${opts.host}:${receivedAt.toISOString()}`;
        messages.push({
          externalId,
          subject,
          fromAddress,
          receivedAt,
          mime,
          imapUid: Number(uid),
        });
        if (Number(uid) > imapLastUid) imapLastUid = Number(uid);
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }

  return {
    messages,
    imapUidValidity,
    imapLastUid: imapLastUid || undefined,
  };
}
