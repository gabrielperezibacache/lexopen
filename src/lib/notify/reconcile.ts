import type { MensajeSaliente, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { canReceiveNotification } from "@/lib/notify/access";
import { notificationTransaction, type NotifyClient } from "@/lib/notify/transaction";
import { writeAuditStrict } from "@/lib/audit";

export async function canReconcileOutbox(row: MensajeSaliente, actorId: string, tx: Prisma.TransactionClient): Promise<boolean> {
  if (row.notificationId) {
    const notice = await tx.notification.findUnique({ where: { id: row.notificationId } });
    return Boolean(notice && await canReceiveNotification(actorId, notice, tx));
  }
  if (row.plantilla === "digest") {
    const payload = JSON.parse(row.payloadJson) as { sourceIds?: string[] };
    const sources = await tx.mensajeSaliente.findMany({ where: { id: { in: payload.sourceIds || [] } } });
    for (const source of sources) if (!await canReconcileOutbox(source, actorId, tx)) return false;
    return sources.length > 0;
  }
  return true;
}

/** The route checks host.admin; this function rechecks resource scope and performs a CAS transition. */
export async function reconcileOutbox(opts: {
  id: string; actorId: string; action: "confirmar_entrega" | "reenviar"; reason: string;
}, client: NotifyClient = prisma) {
  return notificationTransaction(client, async (tx) => {
    const actor = await tx.user.findUnique({ where: { id: opts.actorId } });
    if (!actor || !can(actor, "host.admin")) return { ok: false as const, status: 403 };
    const row = await tx.mensajeSaliente.findUnique({ where: { id: opts.id } });
    if (!row || !await canReconcileOutbox(row, opts.actorId, tx)) return { ok: false as const, status: 404 };
    if (row.estado !== "incierto") return { ok: false as const, status: 409 };
    const sent = opts.action === "confirmar_entrega";
    const updated = await tx.mensajeSaliente.updateMany({ where: { id: row.id, estado: "incierto" }, data: {
      estado: sent ? "enviado" : "encolado", enviadoAt: sent ? new Date() : null,
      envioIniciadoAt: null, lockedAt: null, lockedBy: null, error: null,
      ...(sent ? {} : { intentos: 0, proximoIntentoAt: new Date() }),
    } });
    if (!updated.count) return { ok: false as const, status: 409 };
    if (sent && row.plantilla === "digest") {
      const payload = JSON.parse(row.payloadJson) as { sourceIds?: string[] };
      await tx.mensajeSaliente.updateMany({ where: { id: { in: payload.sourceIds || [] }, estado: "agrupado", userId: row.userId },
        data: { estado: "enviado", enviadoAt: new Date() } });
    }
    await tx.eventoEntrega.create({ data: { mensajeId: row.id, estado: sent ? "confirmado_manualmente" : "reenvio_autorizado", detalle: opts.reason } });
    await writeAuditStrict({ actorId: opts.actorId, action: `notify.${opts.action}`, entityType: "MensajeSaliente", entityId: row.id,
      before: { estado: row.estado }, after: { estado: sent ? "enviado" : "encolado", reason: opts.reason } }, tx);
    return { ok: true as const };
  });
}
