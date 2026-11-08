import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { assertCausaAccess, causaAccessWhere as scopedcausaAccessWhere, requiredCausaWhere as scopedrequiredCausaWhere } from "@/lib/auth/causa-access";
import { prisma } from "@/lib/db";
import { templatesForMateria } from "@/lib/tramite-templates";
import { taskWorkspaceAccessWhere } from "@/lib/tasks/workspace";
import { createTramiteCommand } from "@/lib/tramites/commands";
import { requestCommandKey } from "@/lib/command-execution";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
type Params = { params: Promise<{ id: string }> };
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireStaff();
    const { id } = await params;
    await assertCausaAccess(id, user);
    const causa = await prisma.causa.findFirst({
      where: { AND: [scopedcausaAccessWhere(user), { id }] },
      select: { id: true, materia: true },
    });
    if (!causa) {
      return NextResponse.json({ error: "Causa no encontrada" }, { status: 404 });
    }
    const tramites = await prisma.tramite.findMany({
      where: { AND: [scopedrequiredCausaWhere(user), { causaId: id }, { OR: [{ task: null }, { task: { is: taskWorkspaceAccessWhere(user) } }] }] },
      include: {
        responsable: { select: { id: true, name: true } },
      },
      orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json({
      tramites,
      templates: templatesForMateria(causa.materia),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try { assertCsrf(req); const user=await requireStaff(),{id}=await params,body=await parseKnowledgeBody(req,z.unknown()); return NextResponse.json(await createTramiteCommand(user,id,body,requestCommandKey(req,"tramite.create")),{status:201,headers:{"Cache-Control":"private, no-store"}}); }
  catch(e){return handleRouteError(e);}
}
