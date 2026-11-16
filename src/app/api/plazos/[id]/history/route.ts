import { NextResponse } from "next/server";
import { requireStaff, handleRouteError } from "@/lib/api";
import { serializable } from "@/lib/command-execution";
import { readDeadlineHistory } from "@/lib/deadlines/completion";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireStaff(),
      { id } = await params;
    return NextResponse.json(
      await serializable((tx) =>
        readDeadlineHistory(
          id,
          user,
          tx,
          new URL(req.url).searchParams.get("after") || undefined,
        ),
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return handleRouteError(e);
  }
}
