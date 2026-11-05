"use client";

import { useState } from "react";
import Link from "next/link";
import { CausaManageActions } from "@/components/CausaManageActions";
import { apiMutation } from "@/lib/api-mutation";
import "./CausaActions.css";

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

  return <div className="case-actions">
    <div className="case-actions-primary">
      <Link href={`/causas/${causaId}/minuta/nueva`} className="btn btn-primary">Nueva minuta</Link>
      <details className="case-more-actions">
        <summary>Más acciones</summary>
        <div className="case-actions-directory">
          <CausaManageActions causaId={causaId} titulo={titulo} estado={estado} isAdmin={isAdmin} compact />
          <button className="btn btn-ghost" disabled={busy} onClick={syncObsidian} type="button">{busy ? "Sincronizando…" : "Sincronizar notas"}</button>
          <Link href={`/agente?causaId=${causaId}&utility=copilot`} className="btn btn-ghost">Hablar con ALTAZOR</Link>
        </div>
      </details>
    </div>
    {msg && <p className="case-actions-status" role="status">{msg}</p>}
  </div>;
}
