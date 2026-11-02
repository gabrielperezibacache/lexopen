import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { resolveCitation, verifyStoredCitation } from "@/lib/knowledge/citations";
const citationInput = z.object({ kind: z.enum(["document", "legal"]), fragmentId: z.string().min(1).max(100), quote: z.string().min(1).max(10_000) });
const snapshot = citationInput.extend({ versionId: z.string().min(1).max(100), quoteSha256: z.string().length(64), textSha256: z.string().length(64), sourceSha256: z.string().length(64), sourceKey: z.string().length(64), pageNumber: z.number().int().min(1).max(500).nullable() }).strict();
const schema = z.object({ citation: z.union([snapshot, citationInput.strict()]), causaId: z.string().min(1).max(100).optional() }).strict();
export async function POST(req: Request) {
  try {
    assertCsrf(req); const user = await requireStaff();
    const input = await parseKnowledgeBody(req, schema, 40_000);
    const citation = "sourceKey" in input.citation ? await verifyStoredCitation(input.citation, user, { causaId: input.causaId }) : await resolveCitation(input.citation, user, { causaId: input.causaId });
    return NextResponse.json({ verified: true, href: citation.href, pageNumber: citation.pageNumber, causaId: citation.causaId, siteId: citation.siteId }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return handleRouteError(error); }
}
