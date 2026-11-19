import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { requestCommandKey } from "@/lib/command-execution";
import { fiscaliaDetailAction } from "@/lib/fiscalia/contract";
import { changeFiscaliaDetail, readFiscaliaDetail } from "@/lib/fiscalia/detail";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
type Context = { params: Promise<{ id: string }> };
function failure(error: unknown) {
  const response = handleRouteError(error);
  response.headers.set("Cache-Control", headers["Cache-Control"]);
  return response;
}
export async function GET(request: Request, { params }: Context) {
  try {
    const user = await requireStaff(), { id } = await params;
    const after = new URL(request.url).searchParams.get("after") ?? undefined;
    return NextResponse.json(await readFiscaliaDetail(id, user, after), { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request, { params }: Context) {
  try {
    assertCsrf(request);
    const user = await requireStaff(), { id } = await params;
    const input = await parseKnowledgeBody(request, fiscaliaDetailAction, 16 * 1024);
    return NextResponse.json(await changeFiscaliaDetail(id, user, input, requestCommandKey(request, "fiscalia.detail")), { headers });
  } catch (error) { return failure(error); }
}
