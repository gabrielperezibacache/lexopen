import { z } from "zod";
import { requireStaff, handleRouteError } from "@/lib/api";
import { readCaseJob } from "@/lib/altazor/case-jobs/service";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const after = z.coerce
      .number()
      .int()
      .min(-1)
      .max(2147483647)
      .parse(new URL(_request.url).searchParams.get("afterStep") ?? -1);
    return Response.json(
      await readCaseJob((await params).id, await requireStaff(), after),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
