import { z } from "zod";
import {
  assertCsrf,
  requireStaff,
  handleRouteError,
  parseBody,
} from "@/lib/api";
import {
  readCaseJob,
  caseJobAccess,
  cancelCaseJob,
  confirmCaseProposals,
  resumeCaseJob,
} from "@/lib/altazor/case-jobs/service";
import { advanceCaseJob } from "@/lib/altazor/case-jobs/worker";
import { answerHelpRequest } from "@/lib/altazor/help/service";
import { selectionSchema } from "@/lib/altazor/case-jobs/types";
const command = z
  .object({
    requestId: z
      .string()
      .min(8)
      .max(160)
      .regex(/^[A-Za-z0-9._:-]+$/),
    expectedRevision: z.number().int().positive(),
    confirmation: z.string().length(64).optional(),
    response: z.string().trim().min(1).max(4000).optional(),
  })
  .strict();
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  try {
    assertCsrf(request);
    const user = await requireStaff(),
      { id, action } = await params;
    if (action === "confirm")
      return Response.json(
        await confirmCaseProposals(
          id,
          await parseBody(request, selectionSchema),
          user,
        ),
      );
    if (!["cancel", "resume", "advance", "answer"].includes(action))
      return Response.json({ error: "Acción no disponible" }, { status: 404 });
    const input = await parseBody(request, command);
    if (action === "cancel")
      await cancelCaseJob(id, user, input.expectedRevision);
    if (action === "resume")
      return Response.json(
        await resumeCaseJob(
          id,
          user,
          input.expectedRevision,
          input.confirmation,
        ),
      );
    if (action === "answer") {
      const { job } = await caseJobAccess(id, user);
      if (
        job.revision !== input.expectedRevision ||
        job.status !== "awaiting_help" ||
        !job.helpRequestId ||
        !input.response
      )
        return Response.json(
          { error: "La pregunta cambió. Vuelve a comprobar el encargo." },
          { status: 409 },
        );
      await answerHelpRequest(user, {
        requestId: job.helpRequestId,
        response: input.response,
      });
      await advanceCaseJob(id, user);
    }
    if (action === "advance") {
      const { job } = await caseJobAccess(id, user);
      if (job.revision !== input.expectedRevision)
        return Response.json(
          { error: "El encargo avanzó en otra sesión. Actualiza su estado." },
          { status: 409 },
        );
      await advanceCaseJob(id, user);
    }
    return Response.json(await readCaseJob(id, user));
  } catch (error) {
    return handleRouteError(error);
  }
}
