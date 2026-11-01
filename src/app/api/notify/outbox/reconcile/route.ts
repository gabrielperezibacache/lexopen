import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, handleRouteError, parseBody, requireCapability } from "@/lib/api";
import { prisma } from "@/lib/db";
import { canReconcileOutbox, reconcileOutbox } from "@/lib/notify/reconcile";

export async function GET(req: NextRequest) {
  try {
    const actor = await requireCapability("host.admin");
    const cursor = req.nextUrl.searchParams.get("after");
    const candidates = await prisma.mensajeSaliente.findMany({
      where: { estado: "incierto", ...(cursor ? { id: { gt: cursor } } : {}) }, orderBy: { id: "asc" }, take: 100,
    });
    const items = [];
    for (const row of candidates) if (await canReconcileOutbox(row, actor.id, prisma)) items.push({
      id: row.id, canal: row.canal, plantilla: row.plantilla, createdAt: row.createdAt,
      envioIniciadoAt: row.envioIniciadoAt, proveedor: row.proveedor,
    });
    return NextResponse.json({ items, nextCursor: candidates.length === 100 ? candidates[candidates.length - 1].id : null });
  } catch (error) { return handleRouteError(error); }
}
const schema = z.object({ id: z.string().min(1).max(128), action: z.enum(["confirmar_entrega", "reenviar"]),
  reason: z.string().trim().min(8).max(500), acceptDuplicateRisk: z.boolean().optional(),
}).refine(body => body.action !== "reenviar" || body.acceptDuplicateRisk === true,
  { message: "Confirme que revisó la entrega antes de autorizar el reenvío", path: ["acceptDuplicateRisk"] });
export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const actor = await requireCapability("host.admin");
    const body = await parseBody(req, schema);
    const result = await reconcileOutbox({ ...body, actorId: actor.id });
    if (!result.ok) return NextResponse.json({ error: result.status === 409 ? "El envío ya fue conciliado. Actualice la lista." : result.status === 403 ? "No tiene permiso para conciliar envíos" : "Envío no encontrado" }, { status: result.status });
    return NextResponse.json({ ok: true });
  } catch (error) { return handleRouteError(error); }
}
