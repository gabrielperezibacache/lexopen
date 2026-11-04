import { z } from "zod";
import { httpError } from "@/lib/auth/access";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
import { canonicalJson } from "@/lib/command-execution";
import { sha256 } from "@/lib/evidence/fragments";
import { resolveBookCitation } from "@/lib/books/service";
import type { BookCitation } from "@/lib/books/types";
import type { BookClient } from "@/lib/books/access";
import { resolveCitation, toStoredCitation, verifyStoredCitation, type StoredCitation } from "@/lib/knowledge/citations";
import { memorySupportInput, type MemorySupportInput, type MemorySupportView } from "./memory-types";

type Snapshot = { version: 1; kind: "manual"; ownerId: string; scopeKey: string; text: string } | { version: 1; kind: "book"; citation: BookCitation } | { version: 1; kind: "evidence"; citation: StoredCitation };
export type MemorySupportRow = { id: string; kind: string; sourceKey: string; snapshotJson: string; snapshotSha256: string };
export type MemorySupportTarget = { scopeKey: string; causaId: string | null; manualAllowed: boolean; text: string };
export function bookMemoryIdentity(value: BookCitation) { return { sourceKey: value.sourceKey, sourceSha256: value.sourceSha256, textSha256: value.textSha256, quoteSha256: value.quoteSha256, pageNumber: value.pageNumber, locatorLabel: value.locatorLabel, href: value.href, verificationBasis: value.verificationBasis || "original", retainedSha256: value.retainedSha256 || null }; }
const changed = () => httpError("El respaldo del recuerdo cambió o ya no está disponible", 409);
export async function captureMemorySupport(raw: MemorySupportInput, actor: CausaAccessUser, target: MemorySupportTarget, client: BookClient) {
  const input = memorySupportInput.parse(raw); let snapshot: Snapshot, sourceKey: string;
  if (input.kind === "manual") {
    if (!target.manualAllowed) throw httpError("Un concepto o afirmación necesita un pasaje seleccionado como respaldo", 400);
    snapshot = { version: 1, kind: "manual", ownerId: actor.id, scopeKey: target.scopeKey, text: target.text };
    sourceKey = sha256(canonicalJson(snapshot));
  } else if (input.kind === "book") {
    const citation = await resolveBookCitation({ bookId: input.bookId, fragmentId: input.fragmentId, quote: input.quote }, actor, { client });
    snapshot = { version: 1, kind: "book", citation }; sourceKey = citation.sourceKey;
  } else {
    const citation = await resolveCitation({ kind: input.sourceKind, fragmentId: input.fragmentId, quote: input.quote }, actor, { ...(target.causaId ? { causaId: target.causaId } : { publicOnly: true }), client });
    if (citation.versionId !== input.versionId || citation.kind === "document" && citation.causaId !== target.causaId) throw changed();
    snapshot = { version: 1, kind: "evidence", citation: toStoredCitation(citation) }; sourceKey = citation.sourceKey;
  }
  const snapshotJson = canonicalJson(snapshot);
  return { kind: input.kind, sourceKey, snapshotJson, snapshotSha256: sha256(snapshotJson) };
}
export async function verifyMemorySupport(row: MemorySupportRow, actor: CausaAccessUser, target: MemorySupportTarget, client: BookClient, cache = new Map<string, unknown>()): Promise<MemorySupportView> {
  if (sha256(row.snapshotJson) !== row.snapshotSha256) throw changed();
  let snapshot: Snapshot; try { snapshot = JSON.parse(row.snapshotJson); } catch { throw changed(); }
  if (!snapshot || snapshot.version !== 1 || snapshot.kind !== row.kind) throw changed();
  if (snapshot.kind === "manual") {
    const valid = z.object({ version: z.literal(1), kind: z.literal("manual"), ownerId: z.string(), scopeKey: z.string(), text: z.string().max(2200) }).strict().safeParse(snapshot);
    if (!valid.success || !target.manualAllowed || snapshot.ownerId !== actor.id || snapshot.scopeKey !== target.scopeKey || snapshot.text !== target.text || sha256(canonicalJson(snapshot)) !== row.sourceKey) throw changed();
    return { kind: "manual", title: "Preferencia registrada por ti", href: null, quote: snapshot.text, notice: "Aporte personal; no es un hecho documental corroborado." };
  }
  if (snapshot.kind === "book") {
    const saved = snapshot.citation;
    const fresh = await resolveBookCitation({ bookId: saved.bookId, fragmentId: saved.fragmentId, quote: saved.quote }, actor, { client, cache });
    if (saved.sourceKey !== row.sourceKey || canonicalJson(bookMemoryIdentity(fresh)) !== canonicalJson(bookMemoryIdentity(saved))) throw changed();
    return { kind: "book", title: fresh.title, href: fresh.href, quote: fresh.quote, notice: fresh.verificationBasis === "retained_text" ? "Cotejado contra texto conservado; el original no está disponible." : fresh.partial || fresh.extractionMethod === "ocr" ? "Pasaje con extracción parcial u OCR: revisa el original." : "Pasaje cotejado; su interpretación requiere revisión." };
  }
  if (snapshot.kind !== "evidence") throw changed();
  const fresh = await verifyStoredCitation(snapshot.citation, actor, { ...(target.causaId ? { causaId: target.causaId } : { publicOnly: true }), client, cache });
  if (fresh.sourceKey !== row.sourceKey || fresh.kind === "document" && fresh.causaId !== target.causaId) throw changed();
  return { kind: "evidence", title: fresh.title, href: fresh.href, quote: fresh.quote, notice: !fresh.isCurrent ? "Versión conservada anterior: revisa su pertinencia actual." : fresh.partial ? "Extracción parcial: revisa el original." : "Pasaje cotejado; no acredita por sí mismo la conclusión." };
}
