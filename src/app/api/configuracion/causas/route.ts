import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, handleRouteError, requireRole, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { getCaseManagementMode, updateCaseManagementMode } from "@/lib/causas/management-mode";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
const schema = z.object({ mode: z.enum(["manual", "pjud_cl"]) }).strict();
export async function GET() { try { await requireStaff(); return NextResponse.json({ mode: await getCaseManagementMode() }, { headers }); } catch (error) { return handleRouteError(error); } }
export async function PATCH(request: Request) {
  try { assertCsrf(request); const user = await requireRole("admin"), input = await parseKnowledgeBody(request, schema, 1024); return NextResponse.json(await updateCaseManagementMode(input.mode, user), { headers }); }
  catch (error) { return handleRouteError(error); }
}
