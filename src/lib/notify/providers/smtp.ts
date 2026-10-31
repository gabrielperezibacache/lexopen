import nodemailer from "nodemailer";
import type { SmtpConfig } from "@/lib/notify/config";
import type { ChannelProvider, DecryptedDestination, SendResult } from "./types";
import type { RenderedMessage } from "@/lib/notify/render";
import { redactSecrets } from "@/lib/notify/secrets";

export function createSmtpProvider(config: SmtpConfig): ChannelProvider {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user
      ? { user: config.user, pass: config.pass || "" }
      : undefined,
  });

  return {
    id: "smtp",
    limits: { globalPerSec: 5, perDestinationPerSec: 1 },
    async health() {
      try {
        await transporter.verify();
        return { ok: true, detail: `${config.host}:${config.port}` };
      } catch (e) {
        return {
          ok: false,
          detail: redactSecrets(e instanceof Error ? e.message : String(e), [
            config.pass,
          ]),
        };
      }
    },
    async send(msg: RenderedMessage, dest: DecryptedDestination): Promise<SendResult> {
      if (dest.kind !== "email") {
        return { ok: false, retryable: false, error: "destino no email" };
      }
      try {
        const info = await transporter.sendMail({
          from: config.from,
          to: dest.email,
          subject: msg.subject || msg.title,
          text: msg.text,
          html: msg.html,
        });
        return { ok: true, providerMessageId: info.messageId };
      } catch (e) {
        const err = redactSecrets(e instanceof Error ? e.message : String(e), [
          config.pass,
        ]);
        const retryable = /timeout|ECONN|ETIMEDOUT|421|450|451|452/i.test(err);
        return { ok: false, retryable, error: err };
      }
    },
  };
}
