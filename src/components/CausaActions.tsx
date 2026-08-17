"use client";

import { useState } from "react";
import Link from "next/link";
import { CausaManageActions } from "@/components/CausaManageActions";
import { apiMutation } from "@/lib/api-mutation";

export function CausaActions({
  causaId,
  titulo,
  estado,
  isAdmin,
}: {
  causaId: string;
  titulo: string;
  estado: string;
  isAdmin: boolean;
}) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function syncObsidian() {
    setBusy(true);
    setMsg("");
    const result = await apiMutation<{
      result?: {
        skippedConfidential?: { minutas?: number; documentos?: number };
        warnings?: unknown[];
        mode?: string;
        files?: number;
      };
      error?: string;
    }>("/api/integrations/obsidian", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sync-causa", causaId }),
    });
    setBusy(false);
    if (!result.ok) {
      setMsg(result.error || "Error");
      return;
    }
    const syncResult = result.data.result || {};
    const skipped =
      (syncResult.skippedConfidential?.minutas || 0) +
      (syncResult.skippedConfidential?.documentos || 0);
    const warnCount = Array.isArray(syncResult.warnings)
      ? syncResult.warnings.length
      : 0;
    setMsg(
      `Obsidian (${syncResult.mode || "storage"}): ${syncResult.files ?? 0} archivo(s)` +
        (skipped ? ` · ${skipped} confidencial(es) omitido(s)` : "") +
        (warnCount ? ` · ${warnCount} aviso(s)` : "")
    );
  }

  return (
    <div className="flex w-full flex-col items-stretch gap-3 sm:items-end">
      <CausaManageActions
        causaId={causaId}
        titulo={titulo}
        estado={estado}
        isAdmin={isAdmin}
      />
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
      </div>
      {msg && (
        <p className="text-xs text-[var(--ink-soft)]/75" role="status">
          {msg}
        </p>
      )}
    </div>
  );
}
