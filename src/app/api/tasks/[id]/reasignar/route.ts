import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, handleRouteError, parseBody, requireStaff } from "@/lib/api";
import { updateTasksCommand } from "@/lib/tasks/service";
import { requestCommandKey } from "@/lib/command-execution";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  assigneeId: z.string().min(1).nullable(),
  nota: z.string().max(500).optional().nullable(),
});

export async function POST(req: NextRequest, { params }: Params) {
  try { assertCsrf(req); const user = await requireStaff(); const { id } = await params; const body = await parseBody(req, schema); const tasks = await updateTasksCommand(user, [id], body, requestCommandKey(req, "task.update")); return NextResponse.json(tasks[0]); }
  catch (error) { return handleRouteError(error); }
}
