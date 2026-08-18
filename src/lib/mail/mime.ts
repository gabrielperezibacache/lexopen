import { simpleParser, type ParsedMail, type Attachment } from "mailparser";

export type ParsedMailAttachment = {
  filename: string;
  mimeType: string;
  content: Buffer;
};

export type ParsedMimeMessage = {
  subject: string;
  fromAddress?: string;
  replyTo?: string;
  returnPath?: string;
  receivedAt: Date;
  bodyText: string;
  attachments: ParsedMailAttachment[];
};

const MAX_BODY = 120_000;
const MAX_ATTACHMENT = 20 * 1024 * 1024;

function firstAddress(
  value: ParsedMail["from"] | ParsedMail["replyTo"] | string | undefined
): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  const addr = value.value?.[0]?.address;
  return addr || value.text || undefined;
}

function returnPathFromHeader(parsed: ParsedMail): string | undefined {
  const raw = parsed.headers.get("return-path");
  if (!raw) return undefined;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return String(raw[0] || "");
  return String(raw);
}

function asBuffer(content: Attachment["content"]): Buffer | null {
  if (!content) return null;
  if (Buffer.isBuffer(content)) return content;
  if (typeof content === "string") return Buffer.from(content);
  return null;
}

export function sanitizeMailFilename(name: string | undefined, fallback = "adjunto.bin") {
  const raw = (name || fallback).replace(/[^\w.\-()+ ]+/g, "_").slice(0, 180);
  return raw.trim() || fallback;
}

export async function parseMimeBuffer(source: Buffer | string): Promise<ParsedMimeMessage> {
  const parsed = await simpleParser(source, {
    skipImageLinks: true,
  });
  const body =
    (parsed.text || "").trim() ||
    (parsed.html ? String(parsed.html).replace(/<[^>]+>/g, " ") : "") ||
    parsed.subject ||
    "";
  const attachments: ParsedMailAttachment[] = [];
  for (const att of parsed.attachments || []) {
    if (att.related) continue;
    const buf = asBuffer(att.content);
    if (!buf || buf.byteLength < 20 || buf.byteLength > MAX_ATTACHMENT) continue;
    attachments.push({
      filename: sanitizeMailFilename(att.filename || undefined),
      mimeType: att.contentType || "application/octet-stream",
      content: buf,
    });
  }
  return {
    subject: (parsed.subject || "(sin asunto)").slice(0, 500),
    fromAddress: firstAddress(parsed.from),
    replyTo: firstAddress(parsed.replyTo),
    returnPath: returnPathFromHeader(parsed),
    receivedAt: parsed.date instanceof Date ? parsed.date : new Date(),
    bodyText: body.replace(/\r\n/g, "\n").slice(0, MAX_BODY),
    attachments,
  };
}
