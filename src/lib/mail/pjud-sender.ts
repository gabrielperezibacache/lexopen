/** Addresses that belong to Poder Judicial (pjud.cl), including subdomains. */

const EMAIL_RE = /([^\s<>"',;]+@[^\s<>"',;]+)/i;

export function extractEmailAddress(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const angle = raw.match(/<([^>]+)>/);
  const candidate = (angle?.[1] || raw).match(EMAIL_RE)?.[1];
  if (!candidate) return null;
  return candidate.trim().toLowerCase().replace(/[>\]]+$/, "");
}

export function emailDomain(raw: string | null | undefined): string | null {
  const addr = extractEmailAddress(raw);
  if (!addr) return null;
  const at = addr.lastIndexOf("@");
  if (at < 1) return null;
  return addr.slice(at + 1).toLowerCase().replace(/\.$/, "");
}

export function isPjudMailboxDomain(domain: string | null | undefined): boolean {
  if (!domain) return false;
  const host = domain.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "pjud.cl" || (host.endsWith(".pjud.cl") && host.length > ".pjud.cl".length);
}

export function isPjudMailboxAddress(raw: string | null | undefined): boolean {
  return isPjudMailboxDomain(emailDomain(raw));
}

/** True when From, Reply-To or Return-Path is @pjud.cl / *.pjud.cl. */
export function messageIsFromPjud(input: {
  fromAddress?: string | null;
  replyTo?: string | null;
  returnPath?: string | null;
}): boolean {
  return (
    isPjudMailboxAddress(input.fromAddress) ||
    isPjudMailboxAddress(input.replyTo) ||
    isPjudMailboxAddress(input.returnPath)
  );
}
