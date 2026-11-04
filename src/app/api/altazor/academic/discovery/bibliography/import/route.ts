import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { importBibliographyEntries, importBibliographySchema } from "@/lib/altazor/bibliography-service";
export const runtime = "nodejs";
export async function POST(request: Request) { try { assertCsrf(request); return NextResponse.json(await importBibliographyEntries(await parseKnowledgeBody(request, importBibliographySchema), await requireStaff()), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return handleRouteError(error); } }
