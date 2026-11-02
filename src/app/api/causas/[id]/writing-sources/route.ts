import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff, handleRouteError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { writingSourceCatalog } from "@/lib/writings/sources";

const querySchema = z.object({
  kind: z.enum(["fact", "note", "book"]).optional(),
  q: z.string().trim().max(100).optional(),
  bookId: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  after: z.string().min(1).max(100).optional(),
}).strict();

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireStaff(), { id } = await context.params;
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const catalog = await prisma.$transaction(tx => writingSourceCatalog(id, actor, query, tx), { isolationLevel: "Serializable", timeout: 30_000 });
    return NextResponse.json(catalog, { headers: { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return handleRouteError(error); }
}
