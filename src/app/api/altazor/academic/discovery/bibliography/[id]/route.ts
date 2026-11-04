import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { altazorId } from "@/lib/altazor/schemas";
import { deleteBibliographyEntry } from "@/lib/altazor/bibliography-service";
export const runtime = "nodejs";
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) { try { assertCsrf(request); return NextResponse.json(await deleteBibliographyEntry(altazorId.parse((await params).id), await requireStaff()), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return handleRouteError(error); } }
