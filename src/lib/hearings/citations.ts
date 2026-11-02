import type { CausaAccessUser } from "@/lib/auth/causa-access";
import { httpError } from "@/lib/auth/access";
import { resolveBookCitation } from "@/lib/books/service";
import { formatBookReference, judicialMetadataNotice } from "@/lib/books/references";
import { resolveCitation, verifyStoredCitation, toStoredCitation } from "@/lib/knowledge/citations";
import { sourceFor } from "./sources";
import { unavailable, type HearingClient } from "./access";
import type { HearingCitation, HearingCitationStored } from "./types";
export type HearingQuote = { sourceId: string; fragmentId: string; quote: string };
export async function resolveHearingCitation(causaId: string, workspaceId: string, input: HearingQuote, actor: CausaAccessUser, client: HearingClient, cache = new Map<string, unknown>()): Promise<HearingCitation> {
  const { row, option } = await sourceFor(causaId, workspaceId, input.sourceId, actor, client);
  if (option.kind === "book") {
    const fresh = await resolveBookCitation({ bookId: row.refId, fragmentId: input.fragmentId, quote: input.quote }, actor, { client, cache });
    return { sourceId: row.id, origin: "book", snapshot: fresh, title: fresh.title, reference: formatBookReference(fresh), locator: fresh.locatorLabel, href: fresh.href, quote: fresh.quote, sourceKey: fresh.sourceKey, warning: [fresh.verificationBasis === "retained_text" ? "Cotejado contra texto retenido; original no conservado." : null, fresh.partial || fresh.extractionMethod === "ocr" ? "Lectura parcial u OCR: contraste el original conservado." : null, fresh.sourceType && fresh.sourceType !== "book" ? judicialMetadataNotice : null].filter(Boolean).join(" ") || null };
  }
  const fresh = await resolveCitation({ kind: option.kind === "legal" ? "legal" : "document", fragmentId: input.fragmentId, quote: input.quote }, actor, { causaId, publicOnly: option.kind === "legal", client, cache });
  if (option.kind === "document" && fresh.documentId !== row.refId || option.kind === "site_file" && fresh.siteFileId !== row.refId || option.kind === "legal" && fresh.versionId !== row.refId) throw unavailable();
  return { sourceId: row.id, origin: "knowledge", snapshot: toStoredCitation(fresh), title: fresh.title, reference: fresh.title, locator: fresh.pageNumber ? `Página ${fresh.pageNumber}` : `Fragmento preparado · ${fresh.fragmentId.slice(-8)}`, href: fresh.href, quote: fresh.quote, sourceKey: fresh.sourceKey, warning: [...fresh.warnings, ...(!fresh.isCurrent ? ["Corresponde a una versión conservada anterior."] : []), ...(fresh.partial ? ["Extracción parcial: revise el original."] : [])].join(" ") || null };
}
export function storedHearingCitation(citation: HearingCitation): HearingCitationStored { return { sourceId: citation.sourceId, origin: citation.origin, snapshot: citation.snapshot } as HearingCitationStored; }
export async function verifyHearingCitation(causaId: string, workspaceId: string, value: HearingCitationStored, actor: CausaAccessUser, client: HearingClient, cache = new Map<string, unknown>()) {
  if (!value || !["book", "knowledge"].includes(value.origin) || typeof value.sourceId !== "string" || !value.snapshot || typeof value.snapshot.fragmentId !== "string" || typeof value.snapshot.quote !== "string" || value.snapshot.quote.length > 2200) throw httpError("La cita guardada no pudo corroborarse", 409);
  const current = await resolveHearingCitation(causaId, workspaceId, { sourceId: value.sourceId, fragmentId: value.snapshot.fragmentId, quote: value.snapshot.quote }, actor, client, cache);
  if (current.origin !== value.origin || current.snapshot.sourceKey !== value.snapshot.sourceKey || current.snapshot.sourceSha256 !== value.snapshot.sourceSha256 || current.snapshot.textSha256 !== value.snapshot.textSha256 || current.snapshot.quoteSha256 !== value.snapshot.quoteSha256 || current.snapshot.pageNumber !== value.snapshot.pageNumber) throw httpError("La cita guardada cambió; vuelva a seleccionar el pasaje", 409);
  if (value.origin === "knowledge") await verifyStoredCitation(value.snapshot, actor, { causaId, publicOnly: value.snapshot.kind === "legal", client, cache });
  else if (current.origin === "book" && ((current.snapshot.verificationBasis || "original") !== (value.snapshot.verificationBasis || "original") || current.snapshot.retainedSha256 !== value.snapshot.retainedSha256 || current.snapshot.bookId !== value.snapshot.bookId || current.snapshot.locatorLabel !== value.snapshot.locatorLabel)) throw httpError("La base de cotejo del libro cambió", 409);
  return current;
}
export function citationText(citation: HearingCitation, index?: number) {
  const snapshot = citation.snapshot, retained = citation.origin === "book" && citation.snapshot.verificationBasis === "retained_text";
  return `${index === undefined ? "" : `[${index + 1}] `}${citation.reference}. ${citation.locator}.\n${citation.quote.split("\n").map(line => `> ${line}`).join("\n")}\n${retained ? `Texto conservado SHA-256: ${citation.origin === "book" ? citation.snapshot.retainedSha256 : ""}. Original no conservado; huella del archivo importado sin cotejo actual: ${snapshot.sourceSha256}` : `Original conservado SHA-256: ${snapshot.sourceSha256}`}\n${citation.href}${citation.warning ? `\n${citation.warning}` : ""}`;
}
