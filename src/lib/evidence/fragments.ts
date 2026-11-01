import { createHash } from "node:crypto";

export const EVIDENCE_EXTRACTOR_VERSION = "lexopen-fragments-1";
export const MAX_EVIDENCE_TEXT = 2_000_000;
export function sha256(value: string | Buffer) { return createHash("sha256").update(value).digest("hex"); }

/** Offsets address this exact text, never a guessed PDF page. */
export function splitEvidenceText(text: string, targetSize = 1600) {
  if (!Number.isSafeInteger(targetSize) || targetSize < 64 || targetSize > 4000) throw new RangeError("Tamaño de fragmento inválido");
  if (text.length > MAX_EVIDENCE_TEXT) throw Object.assign(new Error("El texto supera el límite de preparación de fuentes"), { status: 413 });
  const fragments: { ordinal: number; text: string; textSha256: string; startOffset: number; endOffset: number }[] = [];
  let start = 0;
  while (start < text.length) {
    while (start < text.length && /\s/u.test(text[start])) start++;
    if (start === text.length) break;
    let end = Math.min(start + targetSize, text.length);
    if (end < text.length) {
      const paragraph = text.lastIndexOf("\n\n", end);
      const space = text.lastIndexOf(" ", end);
      const boundary = paragraph > start + targetSize / 2 ? paragraph : space;
      if (boundary > start + targetSize / 2) end = boundary;
      if (end > start && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    }
    while (end > start && /\s/u.test(text[end - 1])) end--;
    if (end <= start) end = Math.min(start + targetSize, text.length);
    const fragment = text.slice(start, end);
    fragments.push({ ordinal: fragments.length + 1, text: fragment, textSha256: sha256(fragment), startOffset: start, endOffset: end });
    start = end;
  }
  return fragments;
}

export function verifyEvidenceQuote(fragment: { text: string; textSha256: string }, quote: string) {
  return Boolean(quote.trim()) && sha256(fragment.text) === fragment.textSha256 && fragment.text.includes(quote);
}

export function verifyEvidencePageBinding(fragment: {
  versionId: string; text: string; pageId?: string | null;
  pageStartOffset: number | null; pageEndOffset: number | null;
  page: { versionId: string; text: string; textSha256: string } | null;
}) {
  if (!fragment.page) return !fragment.pageId && fragment.pageStartOffset === null && fragment.pageEndOffset === null;
  const start = fragment.pageStartOffset, end = fragment.pageEndOffset;
  return fragment.page.versionId === fragment.versionId && start !== null && end !== null && Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && end > start && end <= fragment.page.text.length && sha256(fragment.page.text) === fragment.page.textSha256 && fragment.page.text.slice(start, end) === fragment.text;
}
