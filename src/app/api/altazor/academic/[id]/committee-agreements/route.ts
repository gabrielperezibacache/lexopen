import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { createCommitteeActionFromAgreement } from "@/lib/altazor/academic";
import { committeeAgreementConversionSchema } from "@/lib/altazor/academic-schemas";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";

export const runtime = "nodejs";
type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    assertCsrf(request);
    const user = await requireStaff();
    const { id } = await params;
    const input = await parseKnowledgeBody(request, committeeAgreementConversionSchema, 2048);
    const result = await createCommitteeActionFromAgreement(id, input, user);
    return Response.json(result, {
      status: result.reused ? 200 : 201,
      headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
