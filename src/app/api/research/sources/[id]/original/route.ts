import { NextResponse } from "next/server";
import { handleRouteError, requireStaff } from "@/lib/api";
import { readLegalSourceOriginal } from "@/lib/research/service";
import { downloadResponseHeaders } from "@/lib/security/download";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const user = await requireStaff(); const { id } = await params; const original = await readLegalSourceOriginal(id, user); return new NextResponse(new Uint8Array(original.bytes), { headers: downloadResponseHeaders(original.name, "application/octet-stream") }); }
  catch (error) { return handleRouteError(error); }
}
