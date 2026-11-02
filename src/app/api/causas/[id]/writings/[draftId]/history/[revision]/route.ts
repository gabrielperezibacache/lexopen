import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/api";
import { readCaseWritingRevision } from "@/lib/writings/service";
import { writingHeaders, writingRouteError } from "../../../route-error";
type Context = { params: Promise<{ id: string; draftId: string; revision: string }> };
export async function GET(_req: Request, { params }: Context) {
  try { const user = await requireStaff(), { id, draftId, revision } = await params; return NextResponse.json(await readCaseWritingRevision(id, draftId, z.coerce.number().int().min(1).max(2_000_000_000).parse(revision), user), { headers: writingHeaders }); } catch (error) { return writingRouteError(error); }
}
