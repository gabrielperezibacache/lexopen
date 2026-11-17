import { santiagoDateKey } from "@/lib/chile-time";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  assertCausaAccess,
  documentReadWhere,
  plazoAccessWhere,
  taskAccessWhere,
  type CausaAccessUser,
} from "@/lib/auth/causa-access";
import { canonicalJson } from "@/lib/command-execution";
import { sha256 } from "@/lib/evidence/fragments";
import type { CaseSnapshot, CaseJobPlan } from "./types";

export const snapshotHash = (value: unknown) => sha256(canonicalJson(value));
export async function caseSnapshot(
  causaId: string,
  actor: CausaAccessUser,
  db: Prisma.TransactionClient = prisma,
  excludedTasks: string[] = [],
): Promise<CaseSnapshot> {
  await assertCausaAccess(causaId, actor, { auditOverride: false }, db);
  const [cause, documents, deadlines, tasks, movements] = await Promise.all([
    db.causa.findUniqueOrThrow({
      where: { id: causaId },
      select: {
        id: true,
        titulo: true,
        rit: true,
        estado: true,
        etapa: true,
        resumen: true,
        tribunal: true,
        materia: true,
        procedimiento: true,
        ruc: true,
        clienteId: true,
      },
    }),
    db.documento.findMany({
      where: { AND: [{ causaId }, documentReadWhere(actor)] },
      select: { id: true, nombre: true, version: true, updatedAt: true },
      orderBy: { id: "asc" },
    }),
    db.plazo.findMany({
      where: { AND: [{ causaId }, plazoAccessWhere(actor)] },
      select: {
        id: true,
        titulo: true,
        estado: true,
        fechaLimite: true,
        esFatal: true,
        responsable: { select: { name: true } },
      },
      orderBy: { id: "asc" },
    }),
    db.task.findMany({
      where: {
        AND: [
          { causaId, id: { notIn: excludedTasks } },
          taskAccessWhere(actor),
        ],
      },
      select: {
        id: true,
        title: true,
        description: true,
        assignee: { select: { name: true } },
        status: true,
        waitingOn: true,
        dueDate: true,
      },
      orderBy: { id: "asc" },
    }),
    db.causaMovimiento.findMany({
      where: { causaId },
      select: {
        id: true,
        titulo: true,
        detalle: true,
        tipo: true,
        fuente: true,
        fecha: true,
        pendienteResolucion: true,
      },
      orderBy: { id: "asc" },
    }),
  ]);
  return JSON.parse(
    JSON.stringify({
      cause,
      documents,
      deadlines: deadlines.map((d) => ({
        ...d,
        fechaCivilChile: santiagoDateKey(d.fechaLimite),
      })),
      tasks,
      movements,
    }),
  ) as CaseSnapshot;
}

/** Keep record boundaries where possible; long fields carry an explicit part label. */
export function caseMetadataBlocks(plan: CaseJobPlan) {
  const records = [
    { kind: "causa", value: plan.snapshot.cause },
    ...plan.snapshot.deadlines.map((value) => ({ kind: "plazo", value })),
    ...plan.snapshot.tasks.map((value) => ({ kind: "tarea", value })),
    ...plan.snapshot.movements.map((value) => ({ kind: "movimiento", value })),
  ];
  const prefix = `Registros del estudio al ${plan.asOf}; fechas civiles de Chile (America/Santiago). No se consultó OJV.\n`;
  const blocks: string[] = [];
  let current = prefix;
  for (const record of records) {
    const text = canonicalJson(record.value),
      parts: string[] = [];
    for (let start = 0; start < text.length;) {
      let end = Math.min(start + 5000, text.length);
      if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
      parts.push(text.slice(start, end));
      start = end;
    }
    for (const [i, part] of parts.entries()) {
      const entry = `\nRegistro ${record.kind} ${record.value.id}, parte ${i + 1}/${parts.length} (no inferir datos ausentes de este fragmento):\n${part}\n`;
      if (current.length + entry.length > 6000 && current !== prefix) {
        blocks.push(current);
        current = prefix;
      }
      current += entry;
    }
  }
  if (current !== prefix) blocks.push(current);
  return blocks;
}
