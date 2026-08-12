"use client";

import { useState, type ReactNode } from "react";
import type { AiActionId } from "@/lib/ai/actions";
import { AI_ACTION_META } from "@/lib/ai/actions";

export type AiActionResponse = {
  ok: boolean;
  action: string;
  source: string;
  content: string;
  data: unknown;
  requireApproval?: boolean;
  note?: string;
  error?: string;
  provider?: string;
  model?: string;
};

type Props = {
  action: AiActionId;
  label?: string;
  causaId?: string;
  clienteId?: string;
  documentoId?: string;
  siteId?: string;
  prompt?: string;
  extra?: Record<string, unknown>;
  onResult?: (result: AiActionResponse) => void;
  showPreview?: boolean;
  showNotes?: boolean;
  className?: string;
  children?: ReactNode;
};

export function AiAssist({
  action,
  label,
  causaId,
  clienteId,
  documentoId,
  siteId,
  prompt,
  extra,
  onResult,
  showPreview = true,
  showNotes = true,
  className = "",
  children,
}: Props) {
  const meta = AI_ACTION_META[action];
  const buttonLabel = label || meta.label;
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [preview, setPreview] = useState("");
  const [notes, setNotes] = useState(prompt || "");
  const [open, setOpen] = useState(false);

  async function run() {
    setBusy(true);
    setStatus("");
    setPreview("");
    const res = await fetch("/api/ai/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        prompt: notes || prompt || undefined,
        causaId,
        clienteId,
        documentoId,
        siteId,
        extra,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as AiActionResponse & {
      error?: string;
    };
    setBusy(false);
    if (!res.ok || data.ok === false) {
      setStatus(data.error || data.note || "Error al consultar IA");
      return;
    }
    setPreview(data.content || "");
    setStatus(
      [
        data.source === "demo"
          ? "Modo demo"
          : data.source === "llm"
            ? "Modelo real"
            : data.source,
        data.requireApproval ? "revisión humana requerida" : null,
        data.note || null,
      ]
        .filter(Boolean)
        .join(" · ")
    );
    onResult?.(data);
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => {
            if (!open) setOpen(true);
            else void run();
          }}
          title={meta.description}
        >
          {busy ? "Generando…" : open ? `Ejecutar: ${buttonLabel}` : buttonLabel}
        </button>
        {open && (
          <button
            type="button"
            className="btn btn-ghost text-xs"
            onClick={() => setOpen(false)}
          >
            Cerrar
          </button>
        )}
        {children}
      </div>
      {open && showNotes && (
        <div className="rounded-2xl border border-[var(--line)] bg-white/70 p-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-[var(--ink-soft)]/70">
              Notas opcionales para la IA
            </span>
            <textarea
              className="textarea min-h-[72px]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contexto adicional, tono, énfasis…"
            />
          </label>
          <button
            type="button"
            className="btn btn-primary mt-2"
            disabled={busy}
            onClick={() => void run()}
          >
            {busy ? "Generando…" : "Generar"}
          </button>
        </div>
      )}
      {status && (
        <p className="text-xs text-[var(--copper)]" role="status">
          {status}
        </p>
      )}
      {showPreview && preview && (
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-2xl border border-[var(--line)] bg-white/80 p-3 font-sans text-xs leading-relaxed text-[var(--ink-soft)]/85">
          {preview}
        </pre>
      )}
    </div>
  );
}
