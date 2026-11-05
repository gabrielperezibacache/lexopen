"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, Folder, LoaderCircle, Search, X } from "lucide-react";
import { apiMutation } from "@/lib/api-mutation";
import styles from "./PersonalDriveFolderPicker.module.css";
type FolderChoice = { id: string; name: string };
type Page = { folders: FolderChoice[]; nextPageToken: string | null; incompleteSearch: boolean; connectionId: string };
export function PersonalDriveFolderPicker({ causaId }: { causaId: string }) {
  const router = useRouter(), dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false), [trail, setTrail] = useState<FolderChoice[]>([{ id: "root", name: "Mi unidad" }]), [query, setQuery] = useState(""), [data, setData] = useState<Page | null>(null), [loading, setLoading] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState("");
  const current = trail.at(-1)!;
  const binding = useRef<string | null>(null);
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true); setError(""); setData(null);
      const params = new URLSearchParams({ parentId: current.id, ...(query.trim() ? { query: query.trim() } : {}), ...(binding.current ? { connectionId: binding.current } : {}) });
      void fetch(`/api/integrations/google/drive/${encodeURIComponent(causaId)}/folders?${params}`, { cache: "no-store", signal: controller.signal }).then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "No se pudieron consultar sus carpetas.");
        if (!controller.signal.aborted) { binding.current = body.connectionId; setData(body as Page); }
      }).catch(cause => { if (!controller.signal.aborted) setError(cause.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, query ? 300 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [open, current.id, query, causaId]);
  function begin() { binding.current = null; setTrail([{ id: "root", name: "Mi unidad" }]); setQuery(""); setError(""); setData(null); setOpen(true); }
  function enter(folder: FolderChoice) { const searching = Boolean(query.trim()); setQuery(""); setTrail(previous => searching ? [{ id: "root", name: "Mi unidad" }, folder] : [...previous, folder]); }
  async function more() {
    if (!data?.nextPageToken || !binding.current) return;
    setLoading(true); setError("");
    const params = new URLSearchParams({ parentId: current.id, ...(query.trim() ? { query: query.trim() } : {}), pageToken: data.nextPageToken, connectionId: binding.current });
    try {
      const response = await fetch(`/api/integrations/google/drive/${encodeURIComponent(causaId)}/folders?${params}`, { cache: "no-store" }); const body = await response.json() as Page & { error?: string };
      if (!response.ok) throw new Error(body.error || "No se pudieron consultar más carpetas.");
      setData(previous => ({ ...body, folders: [...(previous?.folders || []), ...body.folders].filter((folder, index, all) => all.findIndex(item => item.id === folder.id) === index) }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo continuar."); }
    finally { setLoading(false); }
  }
  async function choose() {
    if (current.id === "root" || !binding.current) return;
    setSaving(true); setError("");
    const response = await apiMutation(`/api/integrations/google/drive/${encodeURIComponent(causaId)}/sync`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "link-personal-folder", folderRef: current.id, connectionId: binding.current }) });
    setSaving(false);
    if (!response.ok) { setError(response.error); return; }
    setOpen(false); router.refresh();
  }
  return <><button className="btn btn-primary" type="button" onClick={begin}><Folder size={17} aria-hidden="true" />Elegir carpeta de mi Google Drive</button>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={`drive-picker-title-${causaId}`} onCancel={() => setOpen(false)} onClose={() => setOpen(false)}>
      <header className={styles.header}><div><h2 id={`drive-picker-title-${causaId}`}>Elija una carpeta</h2><p>Abra la carpeta que desea reunir con esta causa.</p></div><button className="btn btn-ghost" type="button" aria-label="Cerrar selector de carpetas" onClick={() => setOpen(false)}><X size={21} aria-hidden="true" /></button></header>
      <label className={styles.search}><Search size={18} aria-hidden="true" /><input value={query} maxLength={120} onChange={event => setQuery(event.target.value)} placeholder="Buscar carpetas en mi Drive" aria-label="Buscar carpetas en mi Google Drive" disabled={saving} /></label>
      <nav className={styles.breadcrumb} aria-label="Carpeta actual">{trail.map((folder,index) => <button type="button" key={`${folder.id}-${index}`} disabled={saving || index === trail.length - 1} onClick={() => { setQuery(""); setTrail(previous => previous.slice(0,index + 1)); }}>{index > 0 && <ChevronRight size={13} aria-hidden="true" />}{folder.name}</button>)}</nav>
      <div className={styles.body} aria-busy={loading}>{loading && !data && <p role="status"><LoaderCircle size={18} aria-hidden="true" />Consultando carpetas…</p>}{error && <div role="alert"><p>{error}</p><Link href="/conexiones" onClick={() => setOpen(false)}>Revisar mi conexión de Google</Link></div>}
        {data?.incompleteSearch && <p role="status">Google indicó que esta lista puede estar incompleta. Puede buscar por el nombre de la carpeta.</p>}
        {data && <ul className={styles.folders}>{data.folders.map(folder => <li key={folder.id}><button type="button" onClick={() => enter(folder)} disabled={saving}><Folder size={20} aria-hidden="true" /><span>{folder.name}</span><ChevronRight size={16} aria-hidden="true" /></button></li>)}</ul>}
        {data?.folders.length === 0 && !loading && <p>{query ? "No encontramos carpetas con ese nombre." : "Esta carpeta no contiene otras carpetas. Puede elegirla abajo."}</p>}
        {data?.nextPageToken && <button type="button" className="btn btn-ghost" disabled={loading || saving} onClick={() => void more()}>{loading ? "Consultando…" : "Ver más carpetas"}</button>}
      </div>
      <footer className={styles.footer}><p>Se vinculará esta carpeta y sus subcarpetas. La descarga automática se activa después, con su confirmación.</p><div>{trail.length > 1 && <button type="button" className="btn btn-ghost" disabled={saving} onClick={() => { setQuery(""); setTrail(previous => previous.slice(0,-1)); }}><ArrowLeft size={15} aria-hidden="true" />Volver</button>}<button type="button" className="btn btn-primary" disabled={saving || loading || current.id === "root" || !data || Boolean(error)} onClick={() => void choose()}>{saving ? "Vinculando…" : "Usar esta carpeta"}</button></div></footer>
    </dialog>
  </>;
}
