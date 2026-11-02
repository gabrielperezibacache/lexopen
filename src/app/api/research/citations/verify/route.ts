import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, handleRouteError, parseBody, requireStaff } from "@/lib/api";
import { verifyResearchCitation } from "@/lib/research/service";

const schema = z.object({ kind: z.enum(["legal", "document"]), fragmentId: z.string().min(1).max(200), quote: z.string().min(1).max(20000) });
export async function POST(req: NextRequest) {
  try { assertCsrf(req); const user = await requireStaff(); const input = await parseBody(req, schema); return NextResponse.json(await verifyResearchCitation(input, user), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return handleRouteError(error); }
}
