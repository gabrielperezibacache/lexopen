import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff, handleRouteError } from "@/lib/api";
import { actorFor } from "@/lib/books/access";
import { altazorSourceCatalog, altazorCauseOptions } from "@/lib/altazor/resources";
const querySchema = z.object({ causaId: z.string().max(100).optional(), kind: z.enum(["book", "fact", "note"]).optional(), bookId: z.string().max(100).optional(), q: z.string().max(100).optional(), after: z.string().max(100).optional() });
export async function GET(request: NextRequest) {
  try {
    const user = await actorFor(await requireStaff()), query = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const [catalog, causas] = await Promise.all([
      altazorSourceCatalog(user, query),
      altazorCauseOptions(user, query.causaId),
    ]);
    return NextResponse.json({ ...catalog, causas }, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
  } catch (error) { return handleRouteError(error); }
}
