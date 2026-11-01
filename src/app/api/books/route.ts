import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { actorFor } from "@/lib/books/access";
import { readBookUpload } from "@/lib/books/ingest";
import { importBook, listBooks } from "@/lib/books/service";
export const runtime = "nodejs";
export async function GET() { try { const user = await requireStaff(); return NextResponse.json(await listBooks(user), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return handleRouteError(error); } }
export async function POST(req: Request) { try { assertCsrf(req); const user = await actorFor(await requireStaff()); const result = await importBook(await readBookUpload(req), user); return NextResponse.json(result, { status: result.reused ? 200 : 201, headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return handleRouteError(error); } }
