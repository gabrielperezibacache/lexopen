import { NextResponse } from "next/server";
import { requireStaff, handleRouteError } from "@/lib/api";
import { readOfflineEntity } from "@/lib/offline/service";
export async function GET(req: Request) {
  try {
    const user = await requireStaff(), url = new URL(req.url);
    return NextResponse.json(await readOfflineEntity(user, url.searchParams.get("kind") || "", url.searchParams.get("id") || ""), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return handleRouteError(error); }
}
