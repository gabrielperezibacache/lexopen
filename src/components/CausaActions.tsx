"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AiAssist, type AiActionResponse } from "@/components/ai/AiAssist";

export function CausaActions({ causaId }: { causaId: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function syncObsidian() {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/integrations/obsidian", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sync-causa", causaId }),
    });
    const data = await res.json();
    setBusy(false);
    setMsg(
      res.ok
        ? `Sincronización Obsidian: ${data.result?.files ?? 0} archivos`
        : data.error || "Error"
    );
  }

  async function applyTramites(result: AiActionResponse) {
    const data = result.data as {
      tramites?: Array<{ titulo?: string; detalle?: string; diasLimite?: number }>;
    } | null;
    const items = data?.tramites?.filter((t) => t.titulo?.trim()) || [];
    if (!items.length) {
      setMsg("La IA no devolvió trámites aplicables.");
      return;
    }
    setBusy(true);
    let created = 0;
    for (const item of items) {
      const fechaLimite =
        typeof item.diasLimite === "number" && item.diasLimite > 0
          ? new Date(Date.now() + item.diasLimite * 86400000).toISOString().slice(0, 10)
          : null;
      const res = await fetch(`/api/causas/${causaId}/tramites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: item.titulo,
          detalle: item.detalle || null,
          fechaLimite,
          estado: "pendiente",
        }),
      });
      if (res.ok) created += 1;
    }
    setBusy(false);
    setMsg(`Se crearon ${created} trámites sugeridos por IA.`);
    router.refresh();
  }

  return (
    <div className="flex w-full flex-col items-stretch gap-3 sm:items-end">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
        <Link
          href={`/causas/${causaId}/minuta/nueva`}
          className="btn btn-primary w-full sm:w-auto"
        >
          Nueva minuta
        </Link>
        <button
          className="btn btn-ghost w-full sm:w-auto"
          disabled={busy}
          onClick={syncObsidian}
          type="button"
        >
          Sincronizar Obsidian
        </button>
        <Link
          href={`/agente?causaId=${causaId}`}
          className="btn btn-ghost w-full sm:w-auto"
        >
          Abrir asistente
        </Link>
      </div>

      <div className="w-full max-w-xl space-y-3 rounded-2xl border border-[var(--line)] bg-white/60 p-3 sm:ml-auto">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-soft)]/55">
          Acciones IA
        </p>
        <AiAssist
          action="causa.resumen"
          causaId={causaId}
          label="Resumen procesal"
          onResult={(r) => setMsg(r.content.slice(0, 320))}
        />
        <AiAssist
          action="causa.sugerir_tramites"
          causaId={causaId}
          label="Sugerir trámites"
          showPreview={false}
          onResult={(r) => void applyTramites(r)}
        />
      </div>

      {msg && (
        <p className="max-w-md rounded-2xl border border-[var(--line)] bg-white/80 p-3 text-xs text-[var(--ink-soft)]/80">
          {msg}
        </p>
      )}
    </div>
  );
}
