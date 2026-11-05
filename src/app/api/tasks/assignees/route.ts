import { NextRequest, NextResponse } from "next/server";
import { handleRouteError, requireStaff } from "@/lib/api";
import { httpError } from "@/lib/auth/access";
import { causaAccessWhere, siteAccessWhere } from "@/lib/auth/causa-access";
import { activeDelegadorIds } from "@/lib/auth/delegacion";
import { can } from "@/lib/auth/permissions";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { prisma } from "@/lib/db";
import { taskMutationPermissions } from "@/lib/tasks/service";
import { taskWorkspaceAccessWhere } from "@/lib/tasks/workspace";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireStaff();
    const params = request.nextUrl.searchParams;
    const taskId = params.get("taskId");
    const siteId = params.get("siteId");
    let causaId = params.get("causaId");
    if ([taskId, siteId, causaId].some(value => value && value.length > 100)) throw httpError("Referencia inválida", 400);
    let assignOthers = can(actor, "task.assign");

    if (taskId) {
      const [task, delegators] = await Promise.all([
        prisma.task.findFirst({ where: { id: taskId, ...taskWorkspaceAccessWhere(actor) }, select: { creatorId: true, assigneeId: true } }),
        activeDelegadorIds(actor.id, "task.assign"),
      ]);
      if (!task) throw httpError("Tarea no encontrada", 404);
      const permissions = taskMutationPermissions(actor, task, delegators);
      if (!permissions.edit) throw httpError("No puede modificar esta tarea", 403);
      assignOthers = permissions.assignOthers;
    } else {
      if (siteId) {
        const site = await prisma.site.findFirst({ where: { id: siteId, ...siteAccessWhere(actor) }, select: { causaId: true } });
        if (!site) throw httpError("Espacio no encontrado", 404);
        if (causaId && site.causaId && site.causaId !== causaId) throw httpError("El espacio corresponde a otra causa", 400);
        causaId ||= site.causaId;
      }
      if (causaId && !await prisma.causa.findFirst({ where: { AND: [{ id: causaId }, causaAccessWhere(actor)] }, select: { id: true } })) {
        throw httpError("Causa no encontrada", 404);
      }
    }

    const team = await prisma.user.findMany({
      where: { role: { in: [...STAFF_ROLES] }, ...(assignOthers ? {} : { id: actor.id }) },
      select: { id: true, name: true, role: true, capabilityGrants: true, capabilityRevokes: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    const allowed = await Promise.all(team.map(async member => {
      const accessible = taskId
        ? await prisma.task.findFirst({ where: { id: taskId, ...taskWorkspaceAccessWhere(member) }, select: { id: true } })
        : !causaId || await prisma.causa.findFirst({ where: { AND: [{ id: causaId }, causaAccessWhere(member)] }, select: { id: true } });
      return accessible ? { id: member.id, name: member.name } : null;
    }));
    return NextResponse.json({ users: allowed.filter(Boolean), assignOthers }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return handleRouteError(error);
  }
}
