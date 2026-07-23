import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET() {
  const workflows = await prisma.workflow.findMany({
    include: {
      site: true,
      instances: { orderBy: { createdAt: "desc" }, take: 5, include: { actor: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(workflows);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json();

  if (body.action === "start" && body.workflowId) {
    const instance = await prisma.workflowInstance.create({
      data: {
        workflowId: body.workflowId,
        status: "pending",
        currentStep: 0,
        payloadJson: JSON.stringify(body.payload || {}),
        actorId: user?.id,
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
    const steps = JSON.parse(inst.workflow.stepsJson) as Array<{ name: string }>;
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
        actorId: user?.id,
      },
    });
    return NextResponse.json(updated);
  }

  if (body.action === "create") {
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
}
