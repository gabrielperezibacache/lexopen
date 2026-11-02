/** Atomically freeze a digest into a durable outbox envelope. Retries keep the same members. */
import { Prisma, type PrismaClient, type MensajeSaliente } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { tipoDef } from "@/lib/notify/catalog";
import { notificationTransaction } from "@/lib/notify/transaction";

export async function processDigests(opts?: { now?: Date; mode?: "diario" | "semanal"; client?: PrismaClient; userIds?: string[] }) {
  const client = opts?.client || prisma, now = opts?.now || new Date(), mode = opts?.mode || "diario";
  let queued = 0, messages = 0;
  for (;;) {
    const result = await notificationTransaction(client, async (tx) => {
      const rows = await tx.$queryRaw<MensajeSaliente[]>(Prisma.sql`
        SELECT * FROM "MensajeSaliente" WHERE estado = 'digest' AND "proximoIntentoAt" <= (${now}::timestamptz AT TIME ZONE 'UTC')
          ${opts?.userIds ? Prisma.sql`AND "userId" IN (${Prisma.join(opts.userIds.length ? opts.userIds : ["__none__"])})` : Prisma.empty}
          AND ("digestMode" = ${mode} OR ("digestMode" IS NULL AND ${mode} = 'diario'))
        ORDER BY "proximoIntentoAt", id FOR UPDATE SKIP LOCKED LIMIT 500
      `);
      const groups = new Map<string, MensajeSaliente[]>();
      for (const row of rows) {
        const key = JSON.stringify([row.userId, row.canal, row.canalUsuarioId, row.nivelDetalle]);
        const group = groups.get(key) || []; group.push(row); groups.set(key, group);
      }
      for (const items of groups.values()) {
        const first = items[0], sourceIds = items.map(item => item.id).sort();
        const hash = createHash("sha256").update(sourceIds.join("\n")).digest("hex");
        const user = await tx.user.findUnique({ where: { id: first.userId }, select: { name: true } });
        if (!user) {
          await tx.mensajeSaliente.updateMany({ where: { id: { in: sourceIds }, estado: "digest" }, data: { estado: "suprimido", error: "Usuario eliminado" } });
          continue;
        }
        const payload = { nombre: user.name, sourceIds, items: items.map(item => {
          const vars = JSON.parse(item.payloadJson) as { title?: string; body?: string };
          return { title: vars.title || "LexOpen", body: vars.body || "", seccion: tipoDef(item.plantilla).seccion };
        }) };
        await tx.mensajeSaliente.createMany({ data: [{ id: randomUUID(), notificationId: null,
          userId: first.userId, canal: first.canal, canalUsuarioId: first.canalUsuarioId,
          plantilla: "digest", payloadJson: JSON.stringify(payload), nivelDetalle: first.nivelDetalle,
          dedupeKey: `digest:${mode}:${hash}`, digestMode: mode, prioridad: 9, estado: "encolado", proximoIntentoAt: now,
        }], skipDuplicates: true });
        await tx.mensajeSaliente.updateMany({ where: { id: { in: sourceIds }, estado: "digest" }, data: { estado: "agrupado" } });
      }
      return { rows: rows.length, groups: groups.size };
    });
    queued += result.groups; messages += result.rows;
    if (!result.rows) break;
  }
  return { sent: 0, queued, messages, groups: queued };
}
