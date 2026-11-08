import { assertCsrf, handleRouteError, parseBody, requireStaff } from "@/lib/api";
import { siteRelatedWhere as scopedsiteRelatedWhere } from "@/lib/auth/causa-access";
import { publicUserSelect } from "@/lib/auth/public-user";
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requestCommandKey } from "@/lib/command-execution";
import { workflowCommandSchema, startWorkflowCommand, advanceWorkflowCommand, createWorkflowCommand } from "@/lib/workflows/commands";

export async function GET() {
  try {
    const user = await requireStaff();
    const workflows = await prisma.workflow.findMany({ where: scopedsiteRelatedWhere(user),
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
    const body = await parseBody(req, workflowCommandSchema);
    const key = requestCommandKey(req, `workflow.${body.action}`);
    const result = body.action === "start"
      ? await startWorkflowCommand(user, body, key)
      : body.action === "advance"
        ? await advanceWorkflowCommand(user, body, key)
        : await createWorkflowCommand(user, body, key);
    return NextResponse.json(result, { status: body.action === "advance" ? 200 : 201 });
  } catch (e) {
    return handleRouteError(e);
  }
}
