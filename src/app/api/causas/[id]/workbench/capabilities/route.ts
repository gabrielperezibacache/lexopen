import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/api";
import { writingActor } from "@/lib/writings/access";
import { runtimeCapabilities } from "@/lib/workbench/runtime";
import { workbenchDestination } from "@/lib/workbench/policy";
import { workbenchError, workbenchHeaders } from "@/lib/workbench/http";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_req: Request, { params }: Context) {
  try { const { id } = await params, { actor, canWrite } = await writingActor(id, await requireStaff()); const [runtime, local, assisted] = await Promise.all([runtimeCapabilities(), workbenchDestination(actor.id, "source_packet"), workbenchDestination(actor.id, "assisted_draft")]); return NextResponse.json({ runtime, destinations: { source_packet: local, assisted_draft: assisted }, canWrite, setupHref: "/ayuda/mesa-asistente" }, { headers: workbenchHeaders }); } catch (error) { return workbenchError(error); }
}
