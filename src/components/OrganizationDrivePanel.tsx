"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";
type Folder = { id: string; name: string; url?: string };
type State = { userId: string; canConfigureRoot: boolean; connectionId: string; bindingRevision: string; revision: string; canManage: boolean; root: Folder | null; listing?: { folders: Folder[]; nextPageToken?: string; incompleteSearch?: boolean } };
export function OrganizationDrivePanel({ kind, id }: { kind?: "causa" | "site"; id?: string }) {
  const router = useRouter();
  const [state, setState] = useState<State | null>(null), [error, setError] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [choosing, setChoosing] = useState(false), [reference, setReference] = useState(""), [parent, setParent] = useState("root");
  const [folder, setFolder] = useState<Folder | null>(null);
  useEffect(() => { const controller = new AbortController(); void fetch("/api/integrations/google/organization", { cache: "no-store", signal: controller.signal }).then(async response => { const body = await response.json(); if (!response.ok) throw Error(body.error || "Revisa la conexión de Google"); setState(body); }).catch(e => { if (!controller.signal.aborted) setError(e.message); }); return () => controller.abort(); }, []);
  async function browse(next = "root", pageToken?: string) {
    setBusy(true); setError("");
    const result = await apiMutation<State>(`/api/integrations/google/organization?${new URLSearchParams({ parentId: next, ...(pageToken ? { pageToken } : {}) })}`, { method: "GET", cache: "no-store" });
    setBusy(false); if (!result.ok) { setError(result.error); return; } setState(previous => ({ ...result.data, listing: pageToken ? { ...result.data.listing!, folders: [...(previous?.listing?.folders || []), ...(result.data.listing?.folders || [])] } : result.data.listing })); setParent(next); setChoosing(true);
  }
  async function saveRoot(ref: string) {
    if (!state || !ref) return;
    setBusy(true); setError(""); setMessage("");
    const result = await apiMutation<{ message: string }>("/api/integrations/google/organization", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "root", folderRef: ref, connectionId: state.connectionId, bindingRevision: state.bindingRevision, revision: state.revision, confirmed: true }) });
    setBusy(false); if (!result.ok) { setError(result.error); return; }
    const refreshed = await apiMutation<State>("/api/integrations/google/organization", { method: "GET", cache: "no-store" }); if (refreshed.ok) setState(refreshed.data);
    setMessage(result.data.message); setChoosing(false); setReference(""); setFolder(null);
  }
  async function organize() {
    if (!state || kind && !id) return;
    setBusy(true); setError(""); setMessage("");
    const result = await apiMutation<{ state: string; message: string; folder?: Folder }>("/api/integrations/google/organization", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "organize", kind: kind || "user", id: id || state.userId, revision: state.revision, confirmed: true }) });
    setBusy(false); if (!result.ok) { setError(result.error); return; } setMessage(result.data.message); if (result.data.folder) setFolder(result.data.folder); router.refresh();
  }
  return <section className="panel my-4 space-y-3 rounded-3xl p-5" aria-label="Organización en Google Drive"><h3 className="text-lg font-semibold">Organización en Google Drive</h3>
    <p className="text-sm">Usa la cuenta de Google del estudio, conectada una sola vez por la administración. Elige una carpeta del estudio una vez y prepara destinos por cliente, causa o espacio de trabajo. Los permisos de Drive se administran en Google.</p>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <p className="text-sm"><Link href="/configuracion#google-settings" className="underline">Revisar la conexión de Google del estudio</Link></p>
    {state && <><p>Organización: {state.root ? <a href={state.root.url} target="_blank" rel="noreferrer" className="underline">{state.root.name}</a> : "Sin seleccionar"}</p>
      <p className="text-sm">{!kind ? "Destino: Organización → Usuarios → Mi carpeta." : `Destino: Organización → Clientes → Cliente → ${kind === "site" ? "Espacios de trabajo → Espacio (o la carpeta de su causa vinculada)" : "Causas → Causa"}. Sin cliente asignado, se usa una carpeta identificada para tu cuenta.`}</p>
      <div className="flex flex-wrap gap-3"><button type="button" className="btn btn-secondary" disabled={busy || !state.canManage || !state.canConfigureRoot} onClick={() => void browse()}>{state.root ? "Cambiar Organización" : "Elegir Organización"}</button>{<button type="button" className="btn btn-primary" disabled={busy || !state.canManage || !state.root} onClick={() => void organize()}>{busy ? "Comprobando…" : kind ? "Preparar carpeta organizada" : "Preparar mi carpeta de usuario"}</button>}</div>
      {!state.canConfigureRoot && <p>La administración del Host elige la carpeta compartida de Organización.</p>}
      {!state.canManage && <p>Pide a la administración que autorice la gestión de archivos en la conexión de Google para crear carpetas.</p>}
      {choosing && <div className="space-y-3 rounded-xl border p-4"><p>Elige la carpeta raíz de tu estudio. Cambiarla afecta a destinos nuevos; no mueve ni elimina archivos.</p><div className="flex gap-2"><input className="input flex-1" aria-label="Enlace de carpeta de Organización" value={reference} maxLength={2000} onChange={e => setReference(e.target.value)} placeholder="Pega el enlace de una carpeta de Drive" /><button type="button" className="btn btn-secondary" disabled={busy || !reference.trim()} onClick={() => void saveRoot(reference)}>Usar este enlace</button></div>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void browse()}>Volver a Mi unidad</button>
        <ul className="space-y-2">{state.listing?.folders.map(item => <li key={item.id} className="flex flex-wrap items-center gap-2"><span>{item.name}</span><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void browse(item.id)}>Abrir</button><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void saveRoot(item.id)}>Elegir {item.name}</button></li>)}</ul>
        {state.listing?.incompleteSearch && <p>Google informa que la lista puede estar incompleta. Puedes pegar el enlace de la carpeta.</p>}{state.listing?.nextPageToken && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void browse(parent, state.listing?.nextPageToken)}>Ver más</button>}<button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setChoosing(false)}>Cerrar selector</button>
      </div>}</>}
    {folder?.url && <a className="btn btn-secondary" href={folder.url} target="_blank" rel="noreferrer">Abrir carpeta preparada</a>}
  </section>;
}
