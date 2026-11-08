import { assertPjudManagementEnabled, getCaseManagementMode } from "@/lib/causas/management-mode";
import { prisma } from "@/lib/db";
import {
  diasEntre,
  semaforoPorDiasSinMovimiento,
  type Semaforo,
} from "@/lib/pjud/classify";
import { getGoogleConfig } from "@/lib/integrations/google";
import { sendGmailMessage } from "@/lib/integrations/gmail";
import { emitNotification } from "@/lib/notify/emit";
import { causaAccessWhere } from "@/lib/auth/causa-access";
import { can, canSome } from "@/lib/auth/permissions";
import { isAdmin, isStaff } from "@/lib/auth/rbac";
import { STAFF_ROLES } from "@/lib/auth/roles";
import type { Prisma } from "@prisma/client";

const recipientSelect = { id: true, email: true, name: true, role: true, capabilityGrants: true, capabilityRevokes: true } as const;

/** Re-read the recipient and matter access before each delivery; cached assignment is not authorization. */
export async function authorizedPjudDigestRecipient(userId: string, items: readonly DigestItem[], client: Pick<Prisma.TransactionClient, "user" | "causa"> = prisma) {
  const user = await client.user.findUnique({ where: { id: userId }, select: recipientSelect });
  if (!user || !isStaff(user.role) || !canSome(user, "causa.read")) return null;
  const causes = await client.causa.findMany({
    where: { AND: [{ id: { in: items.map(item => item.causaId) }, pjudMonitoreoActivo: true, estado: "activa" }, causaAccessWhere(user)] },
    select: { id: true },
  });
  const readable = new Set(causes.map(cause => cause.id));
  const permitted = items.filter(item => readable.has(item.causaId));
  return permitted.length ? { user, items: permitted } : null;
}

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
      abogado: { select: recipientSelect },
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

    if (c.abogado && isStaff(c.abogado.role) && canSome(c.abogado, "causa.read") && c.abogado.email) {
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
    where: { role: { in: [...STAFF_ROLES] }, OR: [
      { role: { in: ["admin", "socio", "abogado"] } },
      { capabilityGrants: { contains: "host.admin" } },
      { capabilityGrants: { contains: "causa.override_walls" } },
    ] },
    select: recipientSelect,
    take: 20,
  });
}

export async function runPjudDigest(opts?: { dryRun?: boolean }) {
  await assertPjudManagementEnabled();
  const built = await buildPjudDigest();
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://127.0.0.1:3000"
  ).replace(/\/$/, "");

  const google = await getGoogleConfig().catch(() => null);
  const canEmail = Boolean(google?.accessToken);
  const sent: string[] = [];
  const emailFailed: string[] = [];
  const notified: string[] = [];
  let paused = false;

  // Supervisors/Host managers receive only the unassigned matters they may read.
  if (built.unassigned.length) {
    const staff = (await staffRecipients()).filter(user => isStaff(user.role) && canSome(user, "causa.read"));
    const supervisors = staff.filter(user => isAdmin(user) || can(user, "causa.override_walls"));
    const targets = (supervisors.length ? supervisors : staff.filter(user => user.role === "abogado")).filter(user => user.email);
    for (const user of targets) {
      const permitted = await authorizedPjudDigestRecipient(user.id, built.unassigned);
      if (!permitted) continue;
      const bucket = built.byAbogado.get(user.id) || {
        email: permitted.user.email,
        name: permitted.user.name,
        items: [],
      };
      // Avoid duplicating causas already assigned to this user.
      const existingIds = new Set(bucket.items.map((i) => i.causaId));
      for (const item of permitted.items) {
        if (!existingIds.has(item.causaId)) bucket.items.push(item);
      }
      built.byAbogado.set(user.id, bucket);
    }
  }

  if (!opts?.dryRun) {
    for (const [userId, bucket] of built.byAbogado) {
      if (await getCaseManagementMode() !== "pjud_cl") { paused = true; break; }
      if (!bucket.items.length) continue;
      if (canEmail) {
        const delivery = await authorizedPjudDigestRecipient(userId, bucket.items);
        if (!delivery) continue;
        try {
          await sendGmailMessage({
            to: delivery.user.email,
            subject: `LexOpen PJUD · ${delivery.items.length} causa(s) con novedades`,
            text: formatDigestText(delivery.items, appUrl),
            html: formatDigestHtml(delivery.user.name, delivery.items, appUrl),
          });
          sent.push(delivery.user.email);
        } catch {
          emailFailed.push(delivery.user.email);
        }
      }
      if (await getCaseManagementMode() !== "pjud_cl") { paused = true; break; }
      if (!await authorizedPjudDigestRecipient(userId, bucket.items)) continue;
      await emitNotification({
        tipo: "pjud.digest",
        userId,
        title: "LexOpen PJUD · resumen de novedades",
        // The aggregate has no single source to re-authorize when opened later.
        // Keep matter names out of its persisted copy after future access changes.
        body: "Revisa las novedades de las causas a las que tienes acceso.",
        href: "/causas/monitoreo",
        dedupeKey: `pjud.digest:${userId}:${new Date().toISOString().slice(0, 10)}`,
      });
      notified.push(userId);
    }

    // Keep the original window when a configuration change interrupts delivery.
    // Existing notification dedupe keys remain valid when the batch resumes.
    paused ||= await getCaseManagementMode() !== "pjud_cl";

    const status =
      canEmail && sent.length
        ? emailFailed.length
          ? "partial-email"
          : "emailed"
        : "in-app";

    if (!paused) {
      const completed = await prisma.firmSettings.updateMany({
        where: { id: built.settingsId, caseManagementMode: "pjud_cl" },
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
      paused = completed.count === 0;
    }
  }

  return {
    dryRun: Boolean(opts?.dryRun),
    paused,
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
