import { assertCsrf, handleRouteError, parseBody, requireStaff } from "@/lib/api";
import { organizeCaseDocuments, organizeCaseDocumentsSchema } from "@/lib/causas/document-organization";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const { id } = await params;
    const input = await parseBody(req, organizeCaseDocumentsSchema);
    return Response.json(await organizeCaseDocuments(id, user, input));
  } catch (error) {
    return handleRouteError(error);
  }
}
