import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { bookPreferencesPatchSchema, readBookPreferences, updateBookPreferences } from "@/lib/books/service";
export async function GET() { try { const user = await requireStaff(); return NextResponse.json({ preferences: await readBookPreferences(user) }, { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return handleRouteError(error); } }
export async function PATCH(req: Request) { try { assertCsrf(req); const user = await requireStaff(); const input = await parseKnowledgeBody(req, bookPreferencesPatchSchema, 4096); return NextResponse.json(await updateBookPreferences(input, user), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return handleRouteError(error); } }
