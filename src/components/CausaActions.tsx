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
    setMsg(
      res.ok
        ? `Obsidian sync: ${data.result?.files ?? 0} archivos`
        : data.error || "Error"
    );
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
        <Link
          href={`/agente?causaId=${causaId}&utility=briefing&run=1`}
          className="btn btn-secondary w-full sm:w-auto"
        >
          Briefing IA
        </Link>
        <Link
          href={`/agente?causaId=${causaId}&utility=doc_qa`}
          className="btn btn-ghost w-full sm:w-auto"
        >
          Preguntar a docs
        </Link>
        <Link
          href={`/agente?causaId=${causaId}&utility=copilot`}
          className="btn btn-ghost w-full sm:w-auto"
        >
          Abrir copiloto
        </Link>
        <Link
          href={`/agente?causaId=${causaId}&utility=doc_qa`}
          className="btn btn-ghost w-full sm:w-auto"
        >
          Preguntar a documentos
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
