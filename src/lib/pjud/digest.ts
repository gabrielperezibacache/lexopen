import { prisma } from "@/lib/db";
import {
  diasEntre,
  semaforoPorDiasSinMovimiento,
  type Semaforo,
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
    pendienteResolucion?: boolean;
  }>;
};

async function firmSettings() {
  const org =
    (await prisma.organization.findFirst({ include: { settings: true } })) ||
    (await prisma.organization.create({ data: {}, include: { settings: true } }));
  if (org.settings) return org.settings;
  return prisma.firmSettings.create({ data: { organizationId: org.id } });
}

/** Pure: pick digest-worthy rows given recent movs + overall semáforo. */
export function selectDigestCausa(opts: {
  recentMovimientos: Array<{
    titulo: string;
    fecha: Date;
    tipo: string;
    esReceptor: boolean;
    relevante: boolean;
    pendienteResolucion?: boolean;
  }>;
  lastMovimientoAt: Date | null;
}): { include: boolean; semaforo: Semaforo; movimientos: DigestItem["movimientos"] } {
  const dias = opts.lastMovimientoAt
    ? diasEntre(opts.lastMovimientoAt)
    : null;
  const semaforo = semaforoPorDiasSinMovimiento(dias);
  const relevant = opts.recentMovimientos.filter((m) =>
    isDigestRelevantMovimiento(m, semaforo)
  );
  if (relevant.length === 0 && semaforo !== "rojo") {
    return { include: false, semaforo, movimientos: [] };
  }
  return {
    include: true,
    semaforo,
    movimientos: relevant.length ? relevant : opts.recentMovimientos,
  };
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
        orderBy: { fecha: "desc" },
        take: 1,
      },
    },
  });

  const recentByCausa = await prisma.causaMovimiento.findMany({
    where: {
      causaId: { in: causas.map((c) => c.id) },
      fecha: { gte: since },
    },
    orderBy: { fecha: "desc" },
  });
  const recentMap = new Map<string, typeof recentByCausa>();
  for (const m of recentByCausa) {
    const list = recentMap.get(m.causaId) || [];
    if (list.length < 20) list.push(m);
    recentMap.set(m.causaId, list);
  }

  const items: DigestItem[] = [];
  const byAbogado = new Map<
    string,
    { email: string; name: string; items: DigestItem[] }
  >();
  const unassigned: DigestItem[] = [];

  for (const c of causas) {
    const last = c.movimientos[0] || null;
    const recent = recentMap.get(c.id) || [];
    const picked = selectDigestCausa({
      recentMovimientos: recent.map((m) => ({
        titulo: m.titulo,
        fecha: m.fecha,
        tipo: m.tipo,
        esReceptor: m.esReceptor,
        relevante: m.relevante,
        pendienteResolucion: m.pendienteResolucion,
      })),
      lastMovimientoAt: last?.fecha || null,
    });
    if (!picked.include) continue;

    const item: DigestItem = {
      causaId: c.id,
      rit: c.rit,
      titulo: c.titulo,
      tribunal: c.tribunal,
      semaforo: picked.semaforo,
      movimientos: picked.movimientos,
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
    } else {
      unassigned.push(item);
    }
  }

  return { since, items, byAbogado, unassigned, settingsId: settings.id };
}

/** Pure filter used by digest aggregation (testable). */
export function isDigestRelevantMovimiento(
  m: {
    relevante: boolean;
    esReceptor: boolean;
    pendienteResolucion?: boolean;
    tipo?: string;
  },
  semaforo: string
) {
  return (
    m.relevante ||
    m.esReceptor ||
    Boolean(m.pendienteResolucion) ||
    (m.tipo === "escrito" && Boolean(m.pendienteResolucion)) ||
    semaforo === "rojo"
  );
}

function partitionDigestMovimientos(movimientos: DigestItem["movimientos"]) {
  const receptor = movimientos.filter((m) => m.esReceptor);
  const escritos = movimientos.filter(
    (m) => m.pendienteResolucion || (m.tipo === "escrito" && m.relevante)
  );
  const otros = movimientos.filter(
    (m) => !m.esReceptor && !(m.pendienteResolucion || (m.tipo === "escrito" && m.relevante))
  );
  return { receptor, escritos, otros };
}

export function formatDigestText(items: DigestItem[], appUrl: string) {
  return items
    .map((item) => {
      const { receptor, escritos, otros } = partitionDigestMovimientos(
        item.movimientos
      );
      const sections: string[] = [];
      if (receptor.length) {
        sections.push(
          "  Receptor:",
          ...receptor
            .slice(0, 5)
            .map((m) => `  - ${m.fecha.toISOString().slice(0, 10)} ${m.titulo}`)
        );
      }
      if (escritos.length) {
        sections.push(
          "  Escritos por resolver:",
          ...escritos
            .slice(0, 5)
            .map((m) => `  - ${m.fecha.toISOString().slice(0, 10)} ${m.titulo}`)
        );
      }
      if (otros.length || (!receptor.length && !escritos.length)) {
        sections.push(
          "  Movimientos:",
          ...(otros.length
            ? otros
                .slice(0, 5)
                .map(
                  (m) => `  - ${m.fecha.toISOString().slice(0, 10)} ${m.titulo}`
                )
            : ["  - Sin movimientos nuevos; semáforo rojo"])
        );
      }
      return `${item.rit || item.titulo} [${item.semaforo}]\n${item.tribunal}\n${appUrl}/causas/${item.causaId}\n${sections.join("\n")}`;
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
      const { receptor, escritos, otros } = partitionDigestMovimientos(
        item.movimientos
      );
      const section = (
        title: string,
        list: DigestItem["movimientos"],
        tag?: string
      ) => {
        if (!list.length) return "";
        const lis = list
          .slice(0, 5)
          .map(
            (m) =>
              `<li>${m.fecha.toISOString().slice(0, 10)} — ${escapeHtml(m.titulo)}${
                tag ? ` (${tag})` : ""
              }</li>`
          )
          .join("");
        return `<h4 style="margin:8px 0 4px">${title}</h4><ul>${lis}</ul>`;
      };
      const body =
        section("Receptor", receptor, "receptor") +
        section("Escritos por resolver", escritos, "escrito") +
        section("Movimientos", otros.length ? otros : item.movimientos.length ? [] : [{
          titulo: "Sin movimientos nuevos; semáforo rojo",
          fecha: new Date(),
          tipo: "otro",
          esReceptor: false,
          relevante: false,
        }]);
      return `<h3><a href="${appUrl}/causas/${item.causaId}">${escapeHtml(
        item.rit || item.titulo
      )}</a> · ${escapeHtml(item.semaforo)}</h3>
      <p>${escapeHtml(item.tribunal)}</p>
      ${body || "<p>Sin novedades listadas</p>"}`;
    })
    .join("\n");
  return `<p>Hola ${escapeHtml(recipientName)},</p>
<p>Resumen PJUD LexOpen (~08:00, estilo CausaMonitor):</p>
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

async function staffRecipients() {
  return prisma.user.findMany({
    where: { role: { in: ["admin", "abogado"] } },
    select: { id: true, email: true, name: true, role: true },
    take: 20,
  });
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
  const emailFailed: string[] = [];
  const notified: string[] = [];

  // Route unassigned causas to admins (or first staff).
  if (built.unassigned.length) {
    const staff = await staffRecipients();
    const admins = staff.filter((u) => u.role === "admin");
    const targets = (admins.length ? admins : staff).filter((u) => u.email);
    for (const user of targets) {
      const bucket = built.byAbogado.get(user.id) || {
        email: user.email,
        name: user.name,
        items: [],
      };
      // Avoid duplicating causas already assigned to this user.
      const existingIds = new Set(bucket.items.map((i) => i.causaId));
      for (const item of built.unassigned) {
        if (!existingIds.has(item.causaId)) bucket.items.push(item);
      }
      built.byAbogado.set(user.id, bucket);
    }
  }

  if (!opts?.dryRun) {
    for (const [userId, bucket] of built.byAbogado) {
      if (!bucket.items.length) continue;
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
          emailFailed.push(bucket.email);
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

    const status =
      canEmail && sent.length
        ? emailFailed.length
          ? "partial-email"
          : "emailed"
        : "in-app";

    await prisma.firmSettings.update({
      where: { id: built.settingsId },
      data: {
        pjudDigestLastAt: new Date(),
        pjudDigestLastStatus: status,
        pjudDigestLastNote: `Digest: ${built.items.length} causas · email ${sent.length}${
          emailFailed.length ? ` (falló ${emailFailed.length})` : ""
        } · in-app ${notified.length}${
          canEmail ? "" : " (Gmail no conectado)"
        } · sin abogado ${built.unassigned.length}`,
      },
    });
  }

  return {
    dryRun: Boolean(opts?.dryRun),
    causas: built.items.length,
    emailed: sent.length,
    emailFailed: emailFailed.length,
    notified: notified.length,
    unassigned: built.unassigned.length,
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
