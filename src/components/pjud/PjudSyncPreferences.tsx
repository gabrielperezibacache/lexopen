"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";
export function PjudSyncPreferences({ causaId, enabled: initialEnabled, downloadDocuments: initialDownloads }: { causaId: string; enabled: boolean; downloadDocuments: boolean; intervalMinutes: number | null }) {
  const router = useRouter(), [enabled, setEnabled] = useState(initialEnabled), [downloadDocuments, setDownloads] = useState(initialDownloads), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function save() {
    setBusy(true); setMessage("");
    const result = await apiMutation(`/api/pjud/causas/${encodeURIComponent(causaId)}/preferences`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled, downloadDocuments }) });
    setBusy(false); setMessage(result.ok ? "Preferencias guardadas." : result.error); if (result.ok) router.refresh();
  }
  return <details className="mt-2 text-sm"><summary className="cursor-pointer">Configurar actualizaciones</summary><div className="mt-3 grid max-w-sm gap-3"><label className="flex items-center gap-2"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} disabled={busy} />Revisar novedades de esta causa</label><label className="flex items-start gap-2"><input className="mt-1" type="checkbox" checked={downloadDocuments} onChange={event => setDownloads(event.target.checked)} disabled={busy} />Guardar las resoluciones y documentos nuevos</label><p>Actualización automática a las 08:00 y 22:00, hora de Chile. Puede actualizar manualmente en cualquier momento.</p><button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void save()}>{busy ? "Guardando…" : "Guardar"}</button><p className="text-xs text-[var(--ink-soft)]">Las causas que requieren identificación continuarán cuando ingrese con ClaveÚnica.</p>{message && <p role="status">{message}</p>}</div></details>;
}
