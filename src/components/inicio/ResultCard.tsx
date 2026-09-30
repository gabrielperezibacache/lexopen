"use client";

import Link from "next/link";
import { useState } from "react";
import { formatDateTime } from "@/components/ui";
import { useI18n } from "@/components/i18n/I18nProvider";
import { apiMutation } from "@/lib/api-mutation";

export type AssistantResultItem = {
  toolId: string;
  ok: boolean;
  message: string;
  card?: Record<string, unknown> | null;
  undoToken?: string | null;
  entityId?: string | null;
};

/** Enlace primario a inferir del `card` devuelto por cada tool (best-effort, sin duplicar lógica de dominio). */
function primaryLink(card: Record<string, unknown> | null | undefined): {
  href: string;
  label: string;
} | null {
  if (!card || typeof card !== "object") return null;
  const type = String(card.type || "");
  const id = typeof card.id === "string" ? card.id : undefined;
  const causaId = typeof card.causaId === "string" ? card.causaId : undefined;
  const href = typeof card.href === "string" ? card.href : undefined;

  switch (type) {
    case "evento":
      return { href: "/calendario", label: "Ver en calendario" };
    case "plazo":
      return { href: causaId ? `/causas/${causaId}` : "/plazos", label: "Ver plazo" };
    case "causa":
    case "causa-resumen":
    case "causa-estado":
    case "causa-movimientos":
      return id ? { href: `/causas/${id}`, label: "Abrir causa" } : null;
    case "nota":
      return causaId ? { href: `/causas/${causaId}`, label: "Ver causa" } : null;
    case "tarea":
      return { href: "/tareas", label: "Ver tareas" };
    case "documento":
    case "documento-descarga":
      return href ? { href, label: "Descargar" } : null;
    case "minuta":
    case "minuta-borrador":
      return href ? { href, label: "Ver minuta" } : causaId ? { href: `/causas/${causaId}`, label: "Ver causa" } : null;
    default:
      return null;
  }
}

function CardBody({ card }: { card: Record<string, unknown> | null | undefined }) {
  if (!card || typeof card !== "object") return null;
  const type = String(card.type || "");

  if (type === "evento") {
    const inicio = card.inicio ? String(card.inicio) : null;
    return (
      <p className="text-xs text-[var(--ink-soft)]/70">
        {card.titulo ? String(card.titulo) : ""}
        {inicio ? ` · ${formatDateTime(inicio)}` : ""}
      </p>
    );
  }
  if (type === "plazo") {
    const fecha = card.fechaLimite ? String(card.fechaLimite) : null;
    return (
      <p className="text-xs text-[var(--ink-soft)]/70">
        {card.esFatal ? "Fatal · " : ""}
        {card.titulo ? String(card.titulo) : ""}
        {fecha ? ` · vence ${formatDateTime(fecha)}` : ""}
      </p>
    );
  }
  if (type === "causa-lista" || type === "documento-lista") {
    const items = Array.isArray(card.items) ? (card.items as Array<Record<string, unknown>>) : [];
    if (items.length === 0) return null;
    return (
      <ul className="mt-1 space-y-1 text-xs">
        {items.slice(0, 6).map((it, i) => (
          <li key={i} className="truncate">
            {String(it.rit || it.titulo || it.nombre || it.id || "")}
          </li>
        ))}
      </ul>
    );
  }
  return null;
}

/** Tarjeta de resultado de una acción del asistente: mensaje + acciones Ver/Editar/Deshacer. */
export function ResultCard({ item, onUndone }: { item: AssistantResultItem; onUndone?: () => void }) {
  const { t } = useI18n();
  const [undoing, setUndoing] = useState(false);
  const [undone, setUndone] = useState(false);
  const [undoError, setUndoError] = useState("");
  const link = primaryLink(item.card);

  async function handleUndo() {
    if (!item.undoToken) return;
    setUndoing(true);
    setUndoError("");
    const result = await apiMutation<{ ok: boolean; message?: string; error?: string }>(
      "/api/assistant/undo",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolId: item.toolId, undoToken: item.undoToken }),
      }
    );
    setUndoing(false);
    if (!result.ok) {
      setUndoError(result.error || result.data?.error || t("inicio.result.undoError"));
      return;
    }
    if (!result.data.ok) {
      setUndoError(result.data.message || t("inicio.result.undoError"));
      return;
    }
    setUndone(true);
    onUndone?.();
  }

  return (
    <div
      className={`rounded-2xl border px-3 py-2 text-sm ${
        item.ok
          ? "border-[var(--line)] bg-white/70"
          : "border-red-200 bg-red-50 text-red-800"
      }`}
    >
      <p>{item.message}</p>
      <CardBody card={item.card} />
      {item.ok && (link || item.undoToken) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {link && (
            <Link href={link.href} className="rounded-full border border-[var(--line)] px-3 py-1 text-xs text-[var(--sea)]">
              {link.label}
            </Link>
          )}
          {item.undoToken && !undone && (
            <button
              type="button"
              className="text-xs text-[var(--sea)] underline disabled:opacity-50"
              onClick={handleUndo}
              disabled={undoing}
            >
              {undoing ? t("inicio.result.undoing") : t("inicio.result.undo")}
            </button>
          )}
          {undone && (
            <span className="text-xs text-[var(--ok)]">{t("inicio.result.undone")}</span>
          )}
        </div>
      )}
      {undoError && <p className="mt-1 text-xs text-red-700">{undoError}</p>}
    </div>
  );
}
