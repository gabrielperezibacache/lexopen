import { Prisma, type PrismaClient } from "@prisma/client";
import { format } from "date-fns";

export function escapeAlertHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]!);
}

/** Commit notifications and their delivery markers together, including overlapping cron runs. */
export async function createPlazoAlerts(
  client: PrismaClient,
  opts: { from: Date; until: Date; emailEnabled: boolean }
) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await client.$transaction(async (tx) => {
        const plazos = await tx.plazo.findMany({
          where: {
            estado: "pendiente",
            alertaEnviada: false,
            fechaLimite: { gte: opts.from, lte: opts.until },
            OR: [{ responsableId: { not: null } }, { causa: { abogadoId: { not: null } } }],
          },
          include: {
            responsable: { select: { id: true, email: true, name: true } },
            causa: { select: {
              id: true, titulo: true, rit: true,
              abogado: { select: { id: true, email: true, name: true } },
            } },
          },
          orderBy: [{ fechaLimite: "asc" }, { id: "asc" }],
          take: 100,
        });
        const data: Prisma.NotificationCreateManyInput[] = [];
        const ids: string[] = [];
        const emailBuckets = new Map<string, { email: string; name: string; lines: string[] }>();
        for (const plazo of plazos) {
          const recipients = new Map<string, { id: string; email: string | null; name: string | null }>();
          for (const user of [plazo.responsable, plazo.causa?.abogado]) {
            if (user) recipients.set(user.id, user);
          }
          if (!recipients.size) continue;
          const title = `Plazo próximo · ${plazo.causa?.rit || plazo.causa?.titulo || "sin causa"}`;
          const body = `${plazo.titulo} vence el ${format(plazo.fechaLimite, "yyyy-MM-dd")}.`;
          const href = plazo.causaId ? `/causas/${plazo.causaId}` : "/plazos";
          for (const user of recipients.values()) {
            data.push({ userId: user.id, title, body, href });
            if (opts.emailEnabled && user.email) {
              const bucket = emailBuckets.get(user.email) || {
                email: user.email, name: user.name || user.email, lines: [],
              };
              bucket.lines.push(`• ${title}: ${body}`);
              emailBuckets.set(user.email, bucket);
            }
          }
          ids.push(plazo.id);
        }
        if (data.length) {
          await tx.notification.createMany({ data });
          await tx.plazo.updateMany({ where: { id: { in: ids } }, data: { alertaEnviada: true } });
        }
        return { plazos: plazos.length, notifications: data.length, emailBuckets };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt >= 2) {
        throw error;
      }
    }
  }
}
