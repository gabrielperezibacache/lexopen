import { NextRequest, NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { createAcademicDraft } from "@/lib/altazor/academic";
import { academicDraftCreateSchema } from "@/lib/altazor/academic-schemas";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const { id } = await params;
    const result = await createAcademicDraft(id, await parseKnowledgeBody(req, academicDraftCreateSchema), user);
    return NextResponse.json(result, { status: result.reused ? 200 : 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
