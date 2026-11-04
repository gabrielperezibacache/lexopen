import { NextRequest } from "next/server";
import { computerActor, computerFailure, privateHeaders } from "@/lib/altazor/computer/http";
import { computerScreenshot } from "@/lib/altazor/computer/service";
export const runtime = "nodejs";
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try { const actor = await computerActor(request), { id } = await context.params, bytes = await computerScreenshot(actor, id); return new Response(new Uint8Array(bytes), { headers: { ...privateHeaders, "Content-Type": "image/png", "Content-Security-Policy": "default-src 'none'; sandbox" } }); }
  catch (error) { return computerFailure(error); }
}
