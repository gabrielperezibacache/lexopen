import { deadlineFor } from "@/lib/deadlines/completion";
import { httpError } from "@/lib/auth/access";
import { completionSupportSchema } from "@/lib/deadlines/schemas";
import { updateDeadlineStateInTransaction } from "@/lib/plazo-commands";
import { deadlineVersion } from "@/lib/deadlines/completion";
import {
  deadlineCursorWhere,
  deadlineWindow,
} from "@/lib/deadlines/pagination";
import { documentReadWhere, plazoAccessWhere } from "@/lib/auth/causa-access";
import { currentStaffActor } from "@/lib/auth/staff-actor";
import { assistantTransaction } from "@/lib/assistant/transaction-context";
import {
  requireDeadlineComputation,
  deadlineCalculation,
} from "@/lib/plazos-policy";
import { secureTool } from "@/lib/assistant/secure-tool";
import { z } from "zod";
import { assistantDb as prisma } from "@/lib/assistant/transaction-context";
import { writeAssistantAudit as writeAuditStrict } from "@/lib/assistant/transaction-context";
import { civilDateKey, isValidYmd, ymdToLocalNoon } from "@/lib/chile-time";
import { calcularVencimiento } from "@/lib/plazos";
import { formatPlazoEstimate } from "@/lib/ai/local-assist";
import { storeUndo, consumeUndo } from "@/lib/assistant/plan-store";
import type { AssistantTool } from "./types";

import { STAFF_ROLES } from "@/lib/auth/roles";

export const plazoCrearSchema = z.object({
  titulo: z.string().trim().min(2).max(200),
  descripcion: z.string().trim().max(5000).optional(),
  causaId: z.string().optional(),
  fechaLimite: z.string().trim().max(10).optional(),
  fechaNotificacion: z.string().trim().max(10).optional(),
  diasPlazo: z.number().int().positive().max(3650).optional(),
  tipoComputo: z.enum(["habiles", "corridos"]).optional(),
  esFatal: z.boolean().optional(),
  responsableId: z.string().optional(),
});
export type PlazoCrearInput = z.infer<typeof plazoCrearSchema>;

function resolveFechaLimite(input: PlazoCrearInput): Date | null {
  if (input.fechaLimite && isValidYmd(input.fechaLimite)) {
    return ymdToLocalNoon(input.fechaLimite);
  }
  if (input.diasPlazo) {
    const desde =
      input.fechaNotificacion && isValidYmd(input.fechaNotificacion)
        ? ymdToLocalNoon(input.fechaNotificacion)
        : new Date();
    return calcularVencimiento({
      desde,
      dias: input.diasPlazo,
      tipoComputo: input.tipoComputo || "habiles",
    });
  }
  return null;
}

export const plazoCrearTool: AssistantTool<PlazoCrearInput> = secureTool({
  id: "plazo.crear",
  description: "Crea un plazo (fecha límite calculada o explícita)",
  kind: "write",
  roles: [...STAFF_ROLES],
  inputSchema: plazoCrearSchema,
  preview(input) {
    return `Crear plazo "${input.titulo}". ${input.fechaLimite ? `Fecha indicada: ${input.fechaLimite}.` : "Se comprobará el país antes de estimar su fecha; revise el régimen del procedimiento."}`;
  },
  async execute(input, ctx) {
    if (!input.fechaLimite || input.diasPlazo)
      await requireDeadlineComputation(prisma);
    const fechaLimite = resolveFechaLimite(input);
    if (!fechaLimite) {
      return {
        ok: false,
        message:
          "Indique fechaLimite o diasPlazo para calcular el vencimiento.",
      };
    }
    const plazo = await prisma.plazo.create({
      data: {
        ...(!input.fechaLimite ? deadlineCalculation : {}),
        titulo: input.titulo,
        descripcion: input.descripcion || null,
        fechaLimite,
        fechaNotificacion:
          input.fechaNotificacion && isValidYmd(input.fechaNotificacion)
            ? ymdToLocalNoon(input.fechaNotificacion)
            : null,
        diasPlazo: input.diasPlazo || null,
        tipoComputo: input.tipoComputo || "habiles",
        esFatal: Boolean(input.esFatal),
        tipo: "procesal",
        estado: "pendiente",
        causaId: input.causaId || null,
        responsableId: input.responsableId || ctx.userId,
      },
    });
    if (plazo.causaId) {
      await prisma.activity.create({
        data: {
          tipo: "plazo",
          mensaje: `Plazo${plazo.esFatal ? " fatal" : ""}: ${plazo.titulo} (${civilDateKey(plazo.fechaLimite)})`,
          causaId: plazo.causaId,
          userId: ctx.userId,
        },
      });
    }
    await writeAuditStrict({
      actorId: ctx.userId,
      action: "plazo.create",
      entityType: "Plazo",
      entityId: plazo.id,
      after: plazo,
    });
    const undoToken = await storeUndo({
      toolId: "plazo.crear",
      entityType: "Plazo",
      entityId: plazo.id,
    });
    return {
      ok: true,
      message: `Plazo "${plazo.titulo}" creado, vence el ${civilDateKey(plazo.fechaLimite)}.`,
      entityId: plazo.id,
      undoToken,
      card: {
        type: "plazo",
        id: plazo.id,
        titulo: plazo.titulo,
        fechaLimite: plazo.fechaLimite,
        esFatal: plazo.esFatal,
      },
    };
  },
  async undo(token, ctx) {
    const payload = await consumeUndo(token);
    if (!payload || payload.toolId !== "plazo.crear") {
      return { ok: false, message: "Token de deshacer inválido o vencido." };
    }
    const plazo = await prisma.plazo.findUnique({
      where: { id: payload.entityId },
    });
    if (!plazo) return { ok: false, message: "El plazo ya no existe." };
    if (
      await prisma.plazoStateEvent.findFirst({ where: { plazoId: plazo.id } })
    )
      return {
        ok: false,
        message: "El plazo tiene historial de estado y debe conservarse.",
      };
    await prisma.plazo.delete({ where: { id: plazo.id } });
    await writeAuditStrict({
      actorId: ctx.userId,
      action: "plazo.delete",
      entityType: "Plazo",
      entityId: plazo.id,
      before: plazo,
    });
    return {
      ok: true,
      message: `Se deshizo la creación del plazo "${plazo.titulo}".`,
    };
  },
});

export const plazoEstimarSchema = z.object({
  desde: z.string().trim().min(1).max(10),
  dias: z.number().int().positive().max(3650),
  tipoComputo: z.enum(["habiles", "corridos"]).optional(),
});
export type PlazoEstimarInput = z.infer<typeof plazoEstimarSchema>;

export const plazoEstimarTool: AssistantTool<PlazoEstimarInput> = secureTool({
  id: "plazo.estimar",
  description:
    "Estima un vencimiento (días hábiles o corridos) sin persistir nada",
  kind: "read",
  roles: [...STAFF_ROLES],
  inputSchema: plazoEstimarSchema,
  preview(input) {
    return `Estimar ${input.dias} día(s) desde ${input.desde}. El cálculo requiere Chile y revisión del régimen aplicable.`;
  },
  async execute(input) {
    await requireDeadlineComputation(prisma);
    const estimate = formatPlazoEstimate({
      desde: input.desde,
      dias: input.dias,
      tipoComputo: input.tipoComputo,
    });
    if ("error" in estimate) {
      return { ok: false, message: String(estimate.error) };
    }
    return {
      ok: true,
      message: `Vencimiento estimado: ${estimate.vencimiento} (${estimate.urgenciaLabel}). ${estimate.disclaimer}`,
      card: { type: "plazo-estimacion", ...estimate },
    };
  },
});

const plazoActualizarSchema = z
  .object({
    plazoId: z.string().min(1),
    expectedVersion: z.string().regex(/^[a-f0-9]{64}$/),
    estado: z.enum(["pendiente", "cumplido", "vencido", "suspendido"]),
    completion: completionSupportSchema.optional(),
  })
  .strict();
export const plazoActualizarTool: AssistantTool<
  z.infer<typeof plazoActualizarSchema>
> = secureTool({
  id: "plazo.actualizar",
  description:
    "Registra cumplimiento con respaldo explícito o reabre un plazo, usando la versión consultada. Nunca inventar una justificación.",
  kind: "write",
  roles: [...STAFF_ROLES],
  inputSchema: plazoActualizarSchema,
  async preview(input, ctx) {
    const { row } = await deadlineFor(
      input.plazoId,
      { id: ctx.userId },
      prisma,
    );
    const doc =
      input.completion?.kind === "document"
        ? await prisma.documento.findUnique({
            where: { id: input.completion.documentoId },
            select: { nombre: true },
          })
        : null;
    return `Cambiar «${row.titulo}» de ${row.estado} a ${input.estado}. ${input.completion?.kind === "manual" ? `Justificación manual: ${input.completion.justification}` : input.completion?.kind === "document" ? `Documento: ${doc?.nombre || "seleccionado"}, versión ${input.completion.version}.` : "Sin respaldo de cumplimiento."} Registro interno; no acredita aceptación del tribunal.`;
  },
  async execute(input, ctx) {
    const context = assistantTransaction();
    if (!context) throw Error("Falta la transacción del asistente");
    const row = await updateDeadlineStateInTransaction(
      { id: ctx.userId, role: ctx.role },
      {
        id: input.plazoId,
        estado: input.estado,
        expectedVersion: input.expectedVersion,
        completion: input.completion,
      },
      context.tx,
      "altazor",
    );
    return {
      ok: true,
      entityId: row.id,
      message: `Plazo registrado como ${row.estado}.`,
      card: {
        type: "plazo",
        id: row.id,
        titulo: row.titulo,
        estado: row.estado,
        stateRevision: row.stateRevision,
      },
    };
  },
});
const plazoListarSchema = z
  .object({
    causaId: z.string().optional(),
    q: z.string().max(200).optional(),
    after: z.string().max(512).optional(),
  })
  .strict();
export const plazoListarTool: AssistantTool<z.infer<typeof plazoListarSchema>> =
  secureTool({
    id: "plazo.listar",
    description:
      "Consulta plazos accesibles y sus versiones para proponer un cambio; admite páginas y búsqueda por título.",
    kind: "read",
    roles: [...STAFF_ROLES],
    inputSchema: plazoListarSchema,
    preview() {
      return "Consultar plazos y sus versiones actuales.";
    },
    async execute(input, ctx) {
      const actor = await currentStaffActor({ id: ctx.userId }, prisma);
      const rows = await prisma.plazo.findMany({
        where: {
          AND: [
            plazoAccessWhere(actor),
            ...(input.causaId ? [{ causaId: input.causaId }] : []),
            ...(input.q
              ? [
                  {
                    titulo: { contains: input.q, mode: "insensitive" as const },
                  },
                ]
              : []),
            deadlineCursorWhere(input.after),
          ],
        },
        orderBy: [{ fechaLimite: "asc" }, { id: "asc" }],
        take: 31,
      });
      const window = deadlineWindow(rows, 30);
      return {
        ok: true,
        message: `${window.items.length} plazos consultados.`,
        card: {
          type: "plazos",
          items: window.items.map((row) => ({
            id: row.id,
            titulo: row.titulo,
            estado: row.estado,
            fechaLimite: row.fechaLimite,
            expectedVersion: deadlineVersion(row),
          })),
          next: window.next,
        },
      };
    },
  });

/** Bind names and versions on the server before the user reviews a write plan. */
export async function resolveDeadlineToolInput(
  raw: Record<string, unknown>,
  ctx: import("../types").ToolContext,
  userText: string,
): Promise<Record<string, unknown>> {
  const actor = await currentStaffActor({ id: ctx.userId }, prisma);
  const id = typeof raw.plazoId === "string" ? raw.plazoId : null;
  const title = typeof raw.plazo === "string" ? raw.plazo.trim() : "";
  if (!id && !title)
    throw httpError(
      "Indique el título exacto del plazo que desea modificar.",
      409,
    );
  const rows = await prisma.plazo.findMany({
    where: {
      AND: [
        plazoAccessWhere(actor),
        id ? { id } : { titulo: { equals: title, mode: "insensitive" } },
        ...(ctx.scope ? [{ causaId: ctx.scope.causaId }] : []),
      ],
    },
    take: 2,
  });
  if (rows.length !== 1)
    throw httpError(
      "No se encontró un único plazo accesible. Indique su título exacto en la causa correspondiente.",
      409,
    );
  const row = rows[0];
  if (
    raw.expectedVersion !== undefined &&
    raw.expectedVersion !== deadlineVersion(row)
  )
    throw httpError(
      "El plazo cambió; consulte su versión actual antes de preparar otro cierre.",
      409,
    );
  let completion = raw.completion;
  if (raw.estado === "cumplido" && row.estado !== "cumplido") {
    if (
      completion &&
      typeof completion === "object" &&
      (completion as Record<string, unknown>).kind === "document"
    ) {
      const candidate = completion as Record<string, unknown>,
        docId =
          typeof candidate.documentoId === "string"
            ? candidate.documentoId
            : null,
        docName =
          typeof candidate.nombre === "string" ? candidate.nombre.trim() : "";
      if (!docId && !docName)
        throw httpError(
          "Indique el nombre exacto del documento de respaldo.",
          409,
        );
      const docs = await prisma.documento.findMany({
        where: {
          AND: [
            documentReadWhere(actor),
            { causaId: row.causaId },
            docId
              ? { id: docId }
              : { nombre: { equals: docName, mode: "insensitive" } },
          ],
        },
        select: { id: true, version: true },
        take: 2,
      });
      if (docs.length !== 1)
        throw httpError(
          "Seleccione un único documento accesible de la misma causa.",
          409,
        );
      if (
        candidate.version !== undefined &&
        candidate.version !== docs[0].version
      )
        throw httpError(
          "El documento cambió. Revise la versión actual del respaldo.",
          409,
        );
      completion = {
        kind: "document",
        documentoId: docs[0].id,
        version: docs[0].version,
      };
    }
    const support = completionSupportSchema.safeParse(completion);
    if (!support.success)
      throw httpError(
        "Indique un documento de respaldo o una justificación explícita para cumplir el plazo.",
        409,
      );
    if (
      support.data.kind === "manual" &&
      !userText
        .toLocaleLowerCase()
        .includes(support.data.justification.toLocaleLowerCase())
    )
      throw httpError(
        "Escriba la justificación que debe quedar registrada, sin resumirla ni completarla automáticamente.",
        409,
      );
    completion = support.data;
  }
  return {
    plazoId: row.id,
    expectedVersion: deadlineVersion(row),
    estado: raw.estado,
    ...(completion ? { completion } : {}),
  };
}
