import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertCsrf,
  handleRouteError,
  parseBody,
  requireStaff,
} from "@/lib/api";
import { askLlm, legalSystemPrompt } from "@/lib/integrations/llm";
import {
  AI_ACTION_META,
  AI_ACTIONS,
  buildActionInstructions,
  demoForAction,
  isAiActionId,
  parseActionResult,
} from "@/lib/ai/actions";
import { readCaseStatus } from "@/lib/causas/status-service";
import { buildActionContext } from "@/lib/ai/context";
import { canSome } from "@/lib/auth/permissions";
import { rateLimitAsync } from "@/lib/auth/rate-limit";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const postSchema = z.object({
  action: z.string().min(1),
  prompt: z.string().max(8000).optional().nullable(),
  causaId: z.string().optional().nullable(),
  clienteId: z.string().optional().nullable(),
  documentoId: z.string().optional().nullable(),
  siteId: z.string().optional().nullable(),
  extra: z.record(z.string(), z.unknown()).optional(),
});

export async function GET() {
  try {
    await requireStaff();
    return NextResponse.json({
      actions: AI_ACTIONS.map((id) => ({
        id,
        label: AI_ACTION_META[id].label,
        description: AI_ACTION_META[id].description,
        expectsJson: AI_ACTION_META[id].expectsJson,
      })),
    });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const body = await parseBody(req, postSchema);

    const limited = await rateLimitAsync(`llm:actions:${user.id}`, 30, 60_000);
    if (!limited.ok) {
      return NextResponse.json(
        {
          error:
            "Demasiadas solicitudes al copiloto. Espere un momento e intente de nuevo.",
          code: "rate_limited",
        },
        { status: 429 }
      );
    }

    if (!isAiActionId(body.action)) {
      return NextResponse.json({ error: "Acción IA desconocida" }, { status: 404 });
    }

    const action = body.action;
    if (action === "causa.estado" && (!body.causaId || body.clienteId || body.documentoId || body.siteId || body.prompt || body.extra)) {
      return NextResponse.json({ error: "El estado automático solo admite una causa y usa sus registros actuales." }, { status: 400 });
    }
    const meta = AI_ACTION_META[action];
    const prompt = (body.prompt || "").trim();
    const contextInput = {
      action,
      userRole: user.role,
      user,
      causaId: body.causaId,
      clienteId: body.clienteId,
      documentoId: body.documentoId,
      siteId: body.siteId,
      extra: {
        ...(body.extra || {}),
        ...(prompt ? { notes: prompt } : {}),
      },
    };
    const context = await buildActionContext(contextInput);

    const userContent = [
      buildActionInstructions(action),
      prompt ? `\nNotas del usuario:\n${prompt}` : "",
      `\nContexto LexOpen (JSON):\n${context}`,
    ]
      .filter(Boolean)
      .join("\n");

    const result = await askLlm({
      messages: [
        {
          role: "system",
          content: legalSystemPrompt(
            "Ejecutas una acción puntual del estudio. Si se pide JSON, responde solo JSON válido."
          ),
        },
        { role: "user", content: userContent },
      ],
      causaId: body.causaId || undefined,
      userId: user.id,
      utilityLabel: meta.label,
    });

    if (result.source === "error") {
      return NextResponse.json(
        {
          ok: false,
          action,
          source: result.source,
          content: "",
          data: null,
          requireApproval: true,
          note: "note" in result ? result.note : undefined,
          error: "error" in result ? result.error : "Proveedor IA no disponible",
        },
        { status: 502 }
      );
    }

    let content = result.content;
    if (result.source === "demo") {
      content = demoForAction(action, prompt || JSON.stringify(body.extra || {}));
    }

    // A portal failure or access change while the model was responding invalidates this reading.
    const summary = action === "causa.resumen" && Boolean(body.causaId);
    const currentActor = action === "causa.estado" || summary ? await requireStaff() : user;
    if ((action === "causa.estado" || summary) && !canSome(currentActor, "assistant.use")) {
      return NextResponse.json({ error: "Su cuenta ya no tiene acceso al asistente.", code: "assistant_forbidden" }, { status: 403 });
    }
    const caseStatus = action === "causa.estado" ? await readCaseStatus(body.causaId!, currentActor) : null;
    if (caseStatus && caseStatus.fingerprint !== JSON.parse(context).caseStatus.fingerprint ||
        summary && context !== await buildActionContext({ ...contextInput, user: currentActor, userRole: currentActor.role })) {
      return NextResponse.json({ error: "Los registros cambiaron mientras se generaba la lectura.", code: "case_status_changed" },
        { status: 409, headers: { "Cache-Control": "private, no-store" } });
    }
    const parsed = parseActionResult(action, content);

    await writeAudit({
      action: "ai.action",
      entityType: "ai_action",
      entityId: action,
      actorId: user.id,
      after: {
        source: result.source,
        ok: true,
        causaId: body.causaId || null,
        clienteId: body.clienteId || null,
        documentoId: body.documentoId || null,
      },
    });

    return NextResponse.json({
      ok: true,
      action,
      source: result.source,
      content: parsed.content,
      data: parsed.data,
      requireApproval: result.requireApproval || meta.expectsJson,
      note: "note" in result ? result.note : undefined,
      provider: result.provider,
      model: result.model,
      ...(caseStatus ? { caseStatus } : {}),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return handleRouteError(e);
  }
}
