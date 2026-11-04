import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff, handleRouteError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { causaAccessWhere } from "@/lib/auth/causa-access";
import { actorFor } from "@/lib/books/access";
import { altazorSourceCatalog } from "@/lib/altazor/resources";
const querySchema = z.object({ causaId: z.string().max(100).optional(), kind: z.enum(["book", "fact", "note"]).optional(), bookId: z.string().max(100).optional(), q: z.string().max(100).optional(), after: z.string().max(100).optional() });
export async function GET(request: NextRequest) {
  try {
    const user = await actorFor(await requireStaff()), query = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const [catalog, causas] = await Promise.all([
      altazorSourceCatalog(user, query),
      prisma.causa.findMany({ where: causaAccessWhere(user), select: { id: true, titulo: true, rit: true }, orderBy: { updatedAt: "desc" }, take: 100 }),
    ]);
    return NextResponse.json({ ...catalog, causas }, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
  } catch (error) { return handleRouteError(error); }
}
