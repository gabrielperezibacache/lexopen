import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { bookSearchSchema, searchBooks } from "@/lib/books/rag";
export async function POST(req: Request) {
  try { assertCsrf(req); const user = await requireStaff(); return NextResponse.json(await searchBooks(await parseKnowledgeBody(req, bookSearchSchema, 20_000), user), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return handleRouteError(error); }
}
