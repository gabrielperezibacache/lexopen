import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { httpError } from "@/lib/auth/access";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { resolveBookCitation } from "@/lib/books/service";
import { bookSourceTypeSchema, judicialMetadataSchema } from "@/lib/books/judicial";
const id = z.string().min(1).max(100), hash = z.string().regex(/^[a-f0-9]{64}$/);
const raw = z.object({ bookId: id, fragmentId: id, quote: z.string().min(1).max(10_000) });
const pinned = raw.extend({ sourceKind: z.literal("library_book"), sourceType: bookSourceTypeSchema.optional(), judicial: judicialMetadataSchema.nullable().optional(), verificationBasis: z.enum(["original", "retained_text"]).optional(), retainedSha256: hash.nullable().optional(), ordinal: z.number().int().min(1), quoteSha256: hash, textSha256: hash, sourceSha256: hash, sourceKey: hash, pageNumber: z.number().int().min(1).max(500).nullable(), locatorLabel: z.string().max(1000), href: z.string().max(1000), title: z.string().max(1000), author: z.string().max(1000), year: z.string().max(100), edition: z.string().max(1000), publisher: z.string().max(1000), extractionMethod: z.string().max(100), partial: z.boolean(), score: z.number().finite().nonnegative().optional() }).strict();
const schema = z.object({ citation: z.union([pinned, raw.strict()]) }).strict();
export async function POST(req: Request) {
  try {
    assertCsrf(req); const user = await requireStaff(), input = await parseKnowledgeBody(req, schema, 60_000), citation = await resolveBookCitation({ bookId: input.citation.bookId, fragmentId: input.citation.fragmentId, quote: input.citation.quote }, user);
    if ("sourceKey" in input.citation && (input.citation.sourceKey !== citation.sourceKey || input.citation.sourceSha256 !== citation.sourceSha256 || input.citation.textSha256 !== citation.textSha256 || input.citation.quoteSha256 !== citation.quoteSha256 || input.citation.pageNumber !== citation.pageNumber || input.citation.locatorLabel !== citation.locatorLabel || input.citation.href !== citation.href || (input.citation.verificationBasis || "original") !== (citation.verificationBasis || "original") || input.citation.verificationBasis === "retained_text" && (!input.citation.retainedSha256 || input.citation.retainedSha256 !== citation.retainedSha256) || input.citation.retainedSha256 != null && input.citation.retainedSha256 !== citation.retainedSha256)) throw httpError("La referencia guardada no coincide con el pasaje conservado", 409);
    return NextResponse.json({ verified: true, citation }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return handleRouteError(error); }
}
