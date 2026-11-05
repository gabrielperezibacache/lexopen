"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";
export function PjudSyncPreferences({ causaId, enabled: initialEnabled, downloadDocuments: initialDownloads, intervalMinutes: initialInterval }: { causaId: string; enabled: boolean; downloadDocuments: boolean; intervalMinutes: number | null }) {
  const router = useRouter(), [enabled, setEnabled] = useState(initialEnabled), [downloadDocuments, setDownloads] = useState(initialDownloads), [intervalMinutes, setInterval] = useState(initialInterval || 60), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function save() {
    setBusy(true); setMessage("");
    const result = await apiMutation(`/api/pjud/causas/${encodeURIComponent(causaId)}/preferences`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled, downloadDocuments, intervalMinutes }) });
    setBusy(false); setMessage(result.ok ? "Preferencias guardadas." : result.error); if (result.ok) router.refresh();
  }
  return <details className="mt-2 text-sm"><summary className="cursor-pointer">Configurar actualizaciones</summary><div className="mt-3 grid max-w-sm gap-3"><label className="flex items-center gap-2"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} disabled={busy} />Revisar novedades de esta causa</label><label className="flex items-start gap-2"><input className="mt-1" type="checkbox" checked={downloadDocuments} onChange={event => setDownloads(event.target.checked)} disabled={busy} />Guardar las resoluciones y documentos nuevos</label><label>Revisar<select className="input mt-1" value={intervalMinutes} onChange={event => setInterval(Number(event.target.value))} disabled={busy}>{[[15,"Cada 15 minutos"],[30,"Cada 30 minutos"],[60,"Cada hora"],[180,"Cada 3 horas"],[360,"Cada 6 horas"],[1440,"Una vez al día"]].map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label><button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void save()}>{busy ? "Guardando…" : "Guardar"}</button><p className="text-xs text-[var(--ink-soft)]">Las causas que requieren identificación continuarán cuando ingrese con ClaveÚnica.</p>{message && <p role="status">{message}</p>}</div></details>;
}
