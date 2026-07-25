"use client";

import { useState } from "react";
import Link from "next/link";

export function CausaActions({ causaId }: { causaId: string }) {
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
    setMsg(res.ok ? `Obsidian sync: ${data.result?.files ?? 0} archivos` : data.error || "Error");
  }

  async function askHermes() {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/integrations/hermes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        causaId,
        prompt:
          "Resume el estado procesal de esta causa chilena y sugiere los próximos tres pasos del litigio, considerando las minutas recientes si existen.",
      }),
    });
    const data = await res.json();
    setBusy(false);
    setMsg(data.content?.slice(0, 280) || data.error || "Sin respuesta");
  }

  return (
    <div className="flex w-full flex-col items-stretch gap-2 sm:items-end">
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
          Sync Obsidian
        </button>
        <button
          className="btn btn-secondary w-full sm:w-auto"
          disabled={busy}
          onClick={askHermes}
          type="button"
        >
          Consultar Hermes
        </button>
        <Link
          href={`/agente?causaId=${causaId}`}
          className="btn btn-ghost w-full sm:w-auto"
        >
          Abrir agente
        </Link>
      </div>
      {msg && (
        <p className="max-w-md rounded-2xl border border-[var(--line)] bg-white/80 p-3 text-xs text-[var(--ink-soft)]/80">
          {msg}
        </p>
      )}
    </div>
  );
}
