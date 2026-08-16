import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { publicUserSelect } from "@/lib/auth/public-user";
import { writeAuditStrict } from "@/lib/audit";

export async function GET() {
  try {
    await requireStaff();
    const workflows = await prisma.workflow.findMany({
      include: {
        site: true,
        instances: {
          orderBy: { createdAt: "desc" },
          take: 5,
          include: { actor: { select: publicUserSelect } },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(workflows);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const body = await req.json();

    if (body.action === "start" && body.workflowId) {
      const workflow = await prisma.workflow.findUnique({
        where: { id: body.workflowId },
        select: { id: true },
      });
      if (!workflow) {
        return NextResponse.json({ error: "Workflow no encontrado" }, { status: 404 });
      }
      const instance = await prisma.workflowInstance.create({
        data: {
          workflowId: body.workflowId,
          status: "pending",
          currentStep: 0,
          payloadJson: JSON.stringify(body.payload || {}),
          actorId: user.id,
        },
      });
      return NextResponse.json(instance, { status: 201 });
    }

    if (body.action === "advance" && body.instanceId) {
      const inst = await prisma.workflowInstance.findUnique({
        where: { id: body.instanceId },
        include: { workflow: true },
      });
      if (!inst) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
      if (inst.status === "approved" || inst.status === "rejected") {
        return NextResponse.json({ error: "El workflow ya terminó" }, { status: 409 });
      }
      let steps: Array<{ name: string; role?: string }> = [];
      try {
        const parsed = JSON.parse(inst.workflow.stepsJson);
        steps = Array.isArray(parsed) ? parsed : [];
      } catch {
        return NextResponse.json(
          { error: "Definición de workflow inválida" },
          { status: 400 }
        );
      }
      const current = steps[inst.currentStep];
      if (!current) {
        return NextResponse.json({ error: "Paso de workflow inválido" }, { status: 409 });
      }
      if (
        current.role &&
        current.role !== user.role &&
        user.role !== "admin"
      ) {
        return NextResponse.json(
          { error: "Este paso requiere otro rol" },
          { status: 403 }
        );
      }
      const next = inst.currentStep + 1;
      const done = next >= steps.length || body.decision === "reject";
      const updated = await prisma.workflowInstance.update({
        where: { id: inst.id },
        data: {
          currentStep: done ? inst.currentStep : next,
          status:
            body.decision === "reject"
              ? "rejected"
              : done
                ? "approved"
                : "running",
          actorId: user.id,
        },
      });
      await writeAuditStrict({
        actorId: user.id,
        action: "workflow.advance",
        entityType: "WorkflowInstance",
        entityId: updated.id,
        after: {
          workflowId: inst.workflowId,
          status: updated.status,
          currentStep: updated.currentStep,
          decision: body.decision,
        },
      });
      return NextResponse.json(updated);
    }

    if (body.action === "create") {
      if (typeof body.name !== "string" || !body.name.trim() || !body.siteId) {
        return NextResponse.json(
          { error: "Nombre y site son obligatorios" },
          { status: 400 }
        );
      }
      const site = await prisma.site.findUnique({
        where: { id: body.siteId },
        select: { id: true },
      });
      if (!site) {
        return NextResponse.json({ error: "Site no encontrado" }, { status: 404 });
      }
      const wf = await prisma.workflow.create({
        data: {
          name: body.name,
          description: body.description || null,
          siteId: body.siteId,
          triggerType: body.triggerType || "manual",
          stepsJson: JSON.stringify(
            body.steps || [
              { name: "Revisión abogado", role: "abogado" },
              { name: "Aprobación socio", role: "admin" },
            ]
          ),
        },
      });
      return NextResponse.json(wf, { status: 201 });
    }

    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  } catch (e) {
    return handleRouteError(e);
  }
}
