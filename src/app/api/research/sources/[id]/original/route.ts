import { NextResponse } from "next/server";
import { handleRouteError, requireStaff } from "@/lib/api";
import { readLegalSourceOriginal } from "@/lib/research/service";
import { downloadResponseHeaders } from "@/lib/security/download";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const user = await requireStaff(); const { id } = await params; const original = await readLegalSourceOriginal(id, user); return new NextResponse(new Uint8Array(original.bytes), { headers: { ...downloadResponseHeaders(original.name, "application/octet-stream"), "Last-Modified": original.retrievedAt.toUTCString(), "Content-Digest": `sha-256=:${Buffer.from(original.sourceSha256, "hex").toString("base64")}:` } }); }
  catch (error) { return handleRouteError(error); }
}
