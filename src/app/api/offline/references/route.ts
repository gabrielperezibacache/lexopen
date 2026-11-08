import { NextResponse } from "next/server";
import { requireStaff, handleRouteError } from "@/lib/api";
import { listOfflineReferences } from "@/lib/offline/references";
export async function GET(req: Request) {
  try { const user = await requireStaff(), p = new URL(req.url).searchParams;
    return NextResponse.json(await listOfflineReferences(user, { type: p.get("type") || "", q: p.get("q") || "", after: p.get("after") || undefined, id: p.get("id") || undefined }), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return handleRouteError(error); }
}
