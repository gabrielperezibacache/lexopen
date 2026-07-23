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
          "Resume el estado procesal de esta causa chilena y sugiere los próximos tres pasos del litigio.",
      }),
    });
    const data = await res.json();
    setBusy(false);
    setMsg(data.content?.slice(0, 280) || data.error || "Sin respuesta");
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        <button className="btn btn-ghost" disabled={busy} onClick={syncObsidian} type="button">
          Sync Obsidian
        </button>
        <button className="btn btn-secondary" disabled={busy} onClick={askHermes} type="button">
          Consultar Hermes
        </button>
        <Link href={`/agente?causaId=${causaId}`} className="btn btn-primary">
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
