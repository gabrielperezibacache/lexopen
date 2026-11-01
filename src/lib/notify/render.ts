/**
 * Render Mustache-like simple de plantillas ({{var}}) sin HTML arbitrario.
 */

import { minimoCopy, type NotifyVars } from "@/lib/notify/minimize";
import type { ExternalChannel, NivelDetalle } from "@/lib/notify/catalog";

export type RenderedMessage = {
  subject?: string;
  text: string;
  html?: string;
  /** Para Web Push / Telegram. */
  title: string;
  href?: string | null;
  /** Botones / acciones (ack). */
  actions?: Array<{ id: string; label: string }>;
};

function fill(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    const v = vars[key];
    if (v === undefined || v === null) return "";
    return String(v);
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!
  );
}

export function renderMessage(opts: {
  tipo: string;
  canal: ExternalChannel;
  nivel: NivelDetalle;
  vars: NotifyVars;
  payload: Record<string, unknown>;
  appUrl?: string;
}): RenderedMessage {
  const { tipo, canal, nivel, vars, payload, appUrl } = opts;
  const href =
    (typeof payload.href === "string" && payload.href) ||
    vars.href ||
    null;
  const absoluteHref =
    href && appUrl
      ? href.startsWith("http")
        ? href
        : `${appUrl.replace(/\/$/, "")}${href.startsWith("/") ? href : `/${href}`}`
      : href;

  if (nivel === "minimo" || canal === "telegram" || canal === "push") {
    const mini =
      nivel === "minimo"
        ? minimoCopy(vars, tipo)
        : {
            title: String(payload.title || vars.title || "LexOpen"),
            body: String(payload.body || vars.body || ""),
          };
    const actions =
      tipo === "plazo.fatal" || tipo === "plazo.fatal.escalamiento"
        ? [{ id: "ack", label: "Acusar recibo" }]
        : undefined;
    return {
      title: mini.title,
      text: mini.body,
      subject: mini.title,
      href: absoluteHref,
      actions,
    };
  }

  const title = String(payload.title || vars.title || "LexOpen");
  const body = String(payload.body || vars.body || "");
  const rit = payload.rit ? ` · ${payload.rit}` : "";
  const subject = `LexOpen${rit} · ${title}`;
  const lines = [
    body,
    payload.plazoTitulo ? `Plazo: ${payload.plazoTitulo}` : "",
    payload.fechaLimite ? `Vence: ${payload.fechaLimite}` : "",
    payload.tribunal ? `Tribunal: ${payload.tribunal}` : "",
    absoluteHref ? `Abrir: ${absoluteHref}` : "",
  ].filter(Boolean);

  const text = lines.join("\n");
  const html = `<p>${escapeHtml(body)}</p>${
    absoluteHref
      ? `<p><a href="${escapeHtml(String(absoluteHref))}">Abrir en LexOpen</a></p>`
      : ""
  }`;

  return { title, subject, text, html, href: absoluteHref };
}

export function renderDigest(opts: {
  items: Array<{ title: string; body: string; seccion: string }>;
  nombre: string;
  appUrl?: string;
}): RenderedMessage {
  const bySec = new Map<string, string[]>();
  for (const item of opts.items) {
    const list = bySec.get(item.seccion) || [];
    list.push(`• ${item.title}: ${item.body}`);
    bySec.set(item.seccion, list);
  }
  const sections = [...bySec.entries()]
    .map(([sec, lines]) => [`## ${sec}`, ...lines].join("\n"))
    .join("\n\n");
  const text = [
    `Hola ${opts.nombre},`,
    "",
    "Resumen de LexOpen:",
    "",
    sections,
    "",
    opts.appUrl ? `Abrir: ${opts.appUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    title: "Resumen LexOpen",
    subject: `LexOpen · resumen (${opts.items.length})`,
    text,
    html: `<pre style="font-family:inherit;white-space:pre-wrap">${text
      .split("\n")
      .map((l) => l.replace(/&/g, "&amp;").replace(/</g, "&lt;"))
      .join("<br/>")}</pre>`,
  };
}

export { fill };
