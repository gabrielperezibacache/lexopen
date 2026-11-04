import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { prepareAcademicLinkedInDraft } from "@/lib/altazor/share-origin";
const schema = z.object({ expectedRevision: z.number().int().positive() }).strict();
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; artifactId: string }> }) {
  try {
    assertCsrf(request);
    const user = await requireStaff(), { id, artifactId } = await params, input = await parseKnowledgeBody(request, schema, 4096);
    return NextResponse.json(await prepareAcademicLinkedInDraft(id, artifactId, input.expectedRevision, user), { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return handleRouteError(error); }
}
