import { isPrivateOrLocalHostname } from "@/lib/net/safe-url";

export type ImapFetchOpts = {
  host: string;
  port: number;
  tls: boolean;
  user: string;
  password: string;
  limit?: number;
};

export type RawMailMessage = {
  externalId: string;
  subject: string;
  fromAddress?: string;
  receivedAt: Date;
  bodyText: string;
};

export function assertImapHostAllowed(host: string) {
  const trimmed = host.trim().toLowerCase();
  if (!trimmed) {
    throw new Error("Host IMAP requerido");
  }
  if (isPrivateOrLocalHostname(trimmed)) {
    throw new Error(
      "Host IMAP en red privada o local no permitido (use un proveedor público o demo)"
    );
  }
}

/** Fetch recent messages via IMAP (requires imapflow at runtime). */
export async function fetchImapMessages(
  opts: ImapFetchOpts
): Promise<RawMailMessage[]> {
  assertImapHostAllowed(opts.host);
  let ImapFlow: typeof import("imapflow").ImapFlow;
  try {
    ({ ImapFlow } = await import("imapflow"));
  } catch {
    throw new Error("IMAP no disponible: falta dependencia imapflow en el Host");
  }

  const client = new ImapFlow({
    host: opts.host,
    port: opts.port,
    secure: opts.tls,
    auth: { user: opts.user, pass: opts.password },
    logger: false,
  });

  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
  const out: RawMailMessage[] = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = await client.search({ seen: false }, { uid: true });
      const slice = (uids || []).slice(-limit);
      for (const uid of slice) {
        const msg = await client.fetchOne(
          uid,
          { envelope: true, source: true, internalDate: true },
          { uid: true }
        );
        if (!msg?.envelope) continue;
        const subject = msg.envelope.subject || "(sin asunto)";
        const fromAddress = msg.envelope.from?.[0]?.address || undefined;
        const receivedAt = msg.internalDate || new Date();
        const bodyText = msg.source
          ? msg.source.toString("utf8").slice(0, 120_000)
          : subject;
        const externalId =
          msg.envelope.messageId ||
          `uid:${uid}@${opts.host}:${receivedAt.toISOString()}`;
        out.push({ externalId, subject, fromAddress, receivedAt, bodyText });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }

  return out;
}
