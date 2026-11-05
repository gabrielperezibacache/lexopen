import { assertPjudManagementEnabled } from "@/lib/causas/management-mode";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, handleRouteError, requireStaff, requireCapability } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { addCausaByRol, buscarPorRut, lookupReadiness, previewRolLookup } from "@/lib/pjud/lookup";
import { TRIBUNALES_CHILE } from "@/lib/chile";
import { prisma } from "@/lib/db";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { canSome } from "@/lib/auth/permissions";
import { httpError } from "@/lib/auth/access";
import { rateLimitAsync } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add-rol"), rit: z.string().trim().min(3).max(40), tribunal: z.string().trim().min(3).max(255), titulo: z.string().trim().max(500).optional(), ruc: z.string().trim().max(40).optional().nullable(), materia: z.string().trim().max(100).optional(), syncNow: z.boolean().optional() }).strict(),
  z.object({ action: z.literal("preview-rol"), rit: z.string().trim().min(3).max(40), tribunal: z.string().trim().min(3).max(255), ruc: z.string().trim().max(40).optional().nullable() }).strict(),
  z.object({ action: z.literal("buscar-rut"), rut: z.string().trim().min(7).max(20) }).strict(),
]);
function failure(error: unknown) { const response = handleRouteError(error); for (const [key, value] of Object.entries(headers)) response.headers.set(key, value); return response; }
export async function GET() {
  try {
    const user = await requireStaff(); await requireCapability("causa.read"); await assertPjudManagementEnabled();
    const fromDb = await prisma.tribunal.findMany({ where: { activo: true }, select: { nombre: true }, orderBy: { nombre: "asc" }, take: 2000 });
    const names = new Map<string, string>();
    for (const entry of [...fromDb.map(row => row.nombre), ...TRIBUNALES_CHILE]) {
      const name = entry.replace(/\s+/g, " ").trim(); if (name && !names.has(name.toLocaleLowerCase("es"))) names.set(name.toLocaleLowerCase("es"), name);
    }
    const tribunales = [...names.values()].sort((a,b)=>a.localeCompare(b,"es")), readiness = lookupReadiness();
    return NextResponse.json({ tribunales, count: tribunales.length, readiness, capabilities: { preview: readiness.configured, byRut: readiness.configured, create: canSome(user, "causa.create") } }, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(req: NextRequest) {
  try {
    assertCsrf(req); const user = await requireStaff(); await requireCapability("causa.read"); await assertPjudManagementEnabled();
    const body = await parseKnowledgeBody(req, schema, 8192);
    const limited = await rateLimitAsync(`pjud:lookup:${user.id}`, 12, 60_000);
    if (!limited.ok) throw httpError("Ha realizado varias consultas seguidas. Espere un minuto antes de volver a consultar la OJV.",429);
    if (body.action === "preview-rol") return NextResponse.json(await previewRolLookup({ ...body, signal: req.signal }), { headers });
    if (body.action === "buscar-rut") {
      const causas = await buscarPorRut(body.rut, req.signal);
      return NextResponse.json({ causas, count: causas.length, queriedAt: new Date().toISOString(), note: "Resultados recuperados de la consulta pública disponible. La búsqueda puede estar limitada por año, competencia o tribunal; no representa toda la cartera del litigante." }, { headers });
    }
    await requireCapability("causa.create");
    const result = await addCausaByRol({ ...body, actorId: user.id });
    await writeAudit({ actorId: user.id, action: "pjud.add-rol", entityType: "Causa", entityId: result.causaId, after: { created: result.created, syncStatus: result.sync?.status || null } });
    return NextResponse.json(result, { status: result.created ? 201 : 200, headers });
  } catch (error) { return failure(error); }
}
