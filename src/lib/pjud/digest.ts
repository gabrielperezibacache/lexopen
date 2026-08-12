import { prisma } from "@/lib/db";
import {
  diasEntre,
  semaforoPorDiasSinMovimiento,
} from "@/lib/pjud/classify";
import { getGoogleConfig } from "@/lib/integrations/google";
import { sendGmailMessage } from "@/lib/integrations/gmail";

export type DigestItem = {
  causaId: string;
  rit: string | null;
  titulo: string;
  tribunal: string;
  semaforo: string;
  movimientos: Array<{
    titulo: string;
    fecha: Date;
    tipo: string;
    esReceptor: boolean;
    relevante: boolean;
  }>;
};

async function firmSettings() {
  const org =
    (await prisma.organization.findFirst({ include: { settings: true } })) ||
    (await prisma.organization.create({ data: {}, include: { settings: true } }));
  if (org.settings) return org.settings;
  return prisma.firmSettings.create({ data: { organizationId: org.id } });
}

export async function buildPjudDigest(opts?: { since?: Date }) {
  const settings = await firmSettings();
  const since =
    opts?.since ||
    settings.pjudDigestLastAt ||
    new Date(Date.now() - 24 * 60 * 60 * 1000);

  const causas = await prisma.causa.findMany({
    where: { pjudMonitoreoActivo: true, estado: "activa" },
    include: {
      abogado: { select: { id: true, email: true, name: true, role: true } },
      movimientos: {
        where: { fecha: { gte: since } },
        orderBy: { fecha: "desc" },
        take: 20,
      },
    },
  });

  const items: DigestItem[] = [];
  const byAbogado = new Map<
    string,
    { email: string; name: string; items: DigestItem[] }
  >();

  for (const c of causas) {
    const last = c.movimientos[0];
    const dias = last ? diasEntre(last.fecha) : null;
    const semaforo = semaforoPorDiasSinMovimiento(dias);
    const relevant = c.movimientos.filter((m) =>
      isDigestRelevantMovimiento(m, semaforo)
    );
    if (relevant.length === 0 && semaforo !== "rojo") continue;

    const item: DigestItem = {
      causaId: c.id,
      rit: c.rit,
      titulo: c.titulo,
      tribunal: c.tribunal,
      semaforo,
      movimientos: (relevant.length ? relevant : c.movimientos).map((m) => ({
        titulo: m.titulo,
        fecha: m.fecha,
        tipo: m.tipo,
        esReceptor: m.esReceptor,
        relevante: m.relevante,
      })),
    };
    items.push(item);

    if (c.abogado && c.abogado.role !== "cliente" && c.abogado.email) {
      const bucket = byAbogado.get(c.abogado.id) || {
        email: c.abogado.email,
        name: c.abogado.name,
        items: [],
      };
      bucket.items.push(item);
      byAbogado.set(c.abogado.id, bucket);
    }
  }

  return { since, items, byAbogado, settingsId: settings.id };
}

/** Pure filter used by digest aggregation (testable). */
export function isDigestRelevantMovimiento(
  m: { relevante: boolean; esReceptor: boolean },
  semaforo: string
) {
  return m.relevante || m.esReceptor || semaforo === "rojo";
}

export function formatDigestText(items: DigestItem[], appUrl: string) {
  return items
    .map((item) => {
      const movs = item.movimientos
        .slice(0, 5)
        .map((m) => `  - ${m.fecha.toISOString().slice(0, 10)} ${m.titulo}`)
        .join("\n");
      return `${item.rit || item.titulo} [${item.semaforo}]\n${item.tribunal}\n${appUrl}/causas/${item.causaId}\n${movs}`;
    })
    .join("\n\n");
}

function formatDigestHtml(
  recipientName: string,
  items: DigestItem[],
  appUrl: string
) {
  const rows = items
    .map((item) => {
      const movs = item.movimientos
        .slice(0, 5)
        .map(
          (m) =>
            `<li>${m.fecha.toISOString().slice(0, 10)} — ${escapeHtml(m.titulo)}${
              m.esReceptor ? " (receptor)" : ""
            }</li>`
        )
        .join("");
      return `<h3><a href="${appUrl}/causas/${item.causaId}">${escapeHtml(
        item.rit || item.titulo
      )}</a> · ${escapeHtml(item.semaforo)}</h3>
      <p>${escapeHtml(item.tribunal)}</p>
      <ul>${movs || "<li>Sin movimientos nuevos; semáforo rojo</li>"}</ul>`;
    })
    .join("\n");
  return `<p>Hola ${escapeHtml(recipientName)},</p>
<p>Resumen PJUD LexOpen (últimas actualizaciones):</p>
${rows}
<p style="color:#666;font-size:12px">Digest automático LexOpen · verifique siempre en el portal oficial.</p>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function runPjudDigest(opts?: { dryRun?: boolean }) {
  const built = await buildPjudDigest();
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");

  const google = await getGoogleConfig().catch(() => null);
  const canEmail = Boolean(google?.accessToken);
  const sent: string[] = [];
  const notified: string[] = [];

  if (!opts?.dryRun) {
    for (const [userId, bucket] of built.byAbogado) {
      const subject = `LexOpen PJUD · ${bucket.items.length} causa(s) con novedades`;
      if (canEmail) {
        try {
          await sendGmailMessage({
            to: bucket.email,
            subject,
            text: formatDigestText(bucket.items, appUrl),
            html: formatDigestHtml(bucket.name, bucket.items, appUrl),
          });
          sent.push(bucket.email);
        } catch {
          // fall through to in-app
        }
      }
      await prisma.notification.create({
        data: {
          title: subject,
          body: bucket.items
            .slice(0, 3)
            .map((i) => i.rit || i.titulo)
            .join(" · "),
          href: "/causas/monitoreo",
          userId,
        },
      });
      notified.push(userId);
    }

    await prisma.firmSettings.update({
      where: { id: built.settingsId },
      data: {
        pjudDigestLastAt: new Date(),
        pjudDigestLastStatus: canEmail && sent.length ? "emailed" : "in-app",
        pjudDigestLastNote: `Digest: ${built.items.length} causas · email ${sent.length} · in-app ${notified.length}${
          canEmail ? "" : " (Gmail no conectado)"
        }`,
      },
    });
  }

  return {
    dryRun: Boolean(opts?.dryRun),
    causas: built.items.length,
    emailed: sent.length,
    notified: notified.length,
    gmailConfigured: canEmail,
    since: built.since.toISOString(),
    sample: built.items.slice(0, 5),
  };
}

export async function getDigestStatus() {
  const settings = await firmSettings();
  return {
    lastAt: settings.pjudDigestLastAt,
    lastStatus: settings.pjudDigestLastStatus,
    lastNote: settings.pjudDigestLastNote,
  };
}
