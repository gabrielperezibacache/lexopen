/** Atomic in-app and per-destination outbox, also usable inside a domain transaction. */
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { prioridadPara, tipoDef, type ExternalChannel } from "@/lib/notify/catalog";
import { loadDestinos, loadPerfil, loadPrefs } from "@/lib/notify/channels";
import { minimizeVars, minimoCopy, type NotifyVars } from "@/lib/notify/minimize";
import { resolveDeliveries, type PerfilNotif, type PrefRow, type Destino } from "@/lib/notify/preferences";
import { notificationTransaction, type NotifyClient } from "@/lib/notify/transaction";
import { canReceiveNotification } from "@/lib/notify/access";

export type EmitInput = {
  tipo: string;
  userId: string;
  title: string;
  body: string;
  href?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  dedupeKey?: string | null;
  vars?: NotifyVars;
  now?: Date;
  /** Explicit host-admin provider test; never used by domain alerts. */
  testChannel?: ExternalChannel;
};
export type EmitResult = { notificationId: string | null; mensajes: number; skipped?: string };

export async function emitNotification(input: EmitInput, client: NotifyClient = prisma): Promise<EmitResult> {
  return notificationTransaction(client, async (tx) => {
    if (!await canReceiveNotification(input.userId, {
      entityType: input.entityType, entityId: input.entityId, causaId: input.vars?.causaId, href: input.href,
    }, tx)) return { notificationId: null, mensajes: 0, skipped: "sin_acceso" };

    const now = input.now || new Date();
    const def = tipoDef(input.tipo);
    if (def.soloAdmin || input.testChannel) {
      const user = await tx.user.findUnique({ where: { id: input.userId } });
      if (!user || !can(user, "host.admin")) return { notificationId: null, mensajes: 0, skipped: "sin_permiso" };
    }
    const vars: NotifyVars = { title: input.title, body: input.body, href: input.href, ...input.vars };
    const dedupeKey = input.dedupeKey || (input.entityType && input.entityId
      ? `${input.tipo}:${input.entityType}:${input.entityId}:${input.userId}` : null);
    const candidateId = randomUUID();
    // ON CONFLICT does not poison PostgreSQL's enclosing transaction (unlike catch P2002).
    const created = await tx.notification.createMany({
      data: [{ id: candidateId, userId: input.userId, title: input.title, body: input.body,
        href: input.href || null, tipo: input.tipo, severidad: def.severidad,
        entityType: input.entityType || null, entityId: input.entityId || null, dedupeKey }],
      skipDuplicates: true,
    });
    if (!created.count) {
      const existing = dedupeKey ? await tx.notification.findUnique({ where: { dedupeKey } }) : null;
      return { notificationId: existing?.userId === input.userId ? existing.id : null,
        mensajes: 0, skipped: "dedupe" };
    }
    const [prefs, perfil, { destinos }] = await Promise.all([
      loadPrefs(input.userId, tx), loadPerfil(input.userId, tx), loadDestinos(input.userId, tx),
    ]);
    const deliveries = resolveDeliveries({ tipo: input.tipo,
      prefs: input.testChannel ? [{ tipo: input.tipo, canal: input.testChannel, modo: "realtime" }] : prefs,
      destinos: input.testChannel ? destinos.filter(destination => destination.canal === input.testChannel) : destinos, perfil, now });
    const data = deliveries.map((delivery) => {
      const digest = delivery.modo === "digest_diario" || delivery.modo === "digest_semanal";
      const payload = minimizeVars(vars, delivery.destino.nivel);
      if (delivery.destino.nivel === "minimo") Object.assign(payload, minimoCopy(vars, input.tipo));
      return {
        id: randomUUID(), notificationId: candidateId, userId: input.userId,
        canal: delivery.destino.canal, canalUsuarioId: delivery.destino.canalUsuarioId,
        plantilla: input.tipo, payloadJson: JSON.stringify(payload), nivelDetalle: delivery.destino.nivel,
        dedupeKey: `${dedupeKey || candidateId}:${delivery.destino.canal}:${delivery.destino.canalUsuarioId || "email"}`,
        prioridad: prioridadPara(def.severidad), estado: digest ? "digest" : "encolado",
        digestMode: digest ? (delivery.modo === "digest_semanal" ? "semanal" : "diario") : null,
        proximoIntentoAt: delivery.sendAt,
      };
    });
    const inserted = data.length ? await tx.mensajeSaliente.createMany({ data, skipDuplicates: true }) : { count: 0 };
    return { notificationId: candidateId, mensajes: inserted.count };
  });
}

export async function emitNotificationMany(inputs: EmitInput[], client: NotifyClient = prisma) {
  return notificationTransaction(client, async (tx) => {
    const results: EmitResult[] = [];
    for (const input of inputs) results.push(await emitNotification(input, tx));
    return results;
  });
}

export async function notifyInApp(opts: { userId: string; title: string; body: string; href?: string | null; tipo?: string }) {
  return emitNotification({ ...opts, tipo: opts.tipo || "general" });
}
export type { Destino, PerfilNotif, PrefRow, ExternalChannel };
