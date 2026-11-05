import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { companionPatchSchema, patchAltazorCompanion, readAltazorCompanion } from "@/lib/altazor/companion";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export async function GET() { try { return NextResponse.json(await readAltazorCompanion(await requireStaff()), { headers }); } catch (error) { return handleRouteError(error); } }
export async function PATCH(request: Request) { try { assertCsrf(request); const user = await requireStaff(); return NextResponse.json(await patchAltazorCompanion(await parseKnowledgeBody(request, companionPatchSchema, 4096), user), { headers }); } catch (error) { return handleRouteError(error); } }
