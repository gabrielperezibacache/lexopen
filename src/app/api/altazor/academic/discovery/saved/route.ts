import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { listAcademicSearches, saveAcademicSearch, saveAcademicSearchSchema } from "@/lib/altazor/academic-discovery";
export const runtime = "nodejs";
export async function GET() { try { return NextResponse.json(await listAcademicSearches(await requireStaff()), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return handleRouteError(error); } }
export async function POST(request: Request) { try { assertCsrf(request); return NextResponse.json(await saveAcademicSearch(await parseKnowledgeBody(request, saveAcademicSearchSchema, 8192), await requireStaff()), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return handleRouteError(error); } }
