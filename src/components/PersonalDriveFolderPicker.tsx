"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, Folder, FolderPlus, LoaderCircle, Search, X } from "lucide-react";
import { apiMutation } from "@/lib/api-mutation";
import styles from "./PersonalDriveFolderPicker.module.css";

type FolderChoice = { id: string; name: string };
type Page = { folders: FolderChoice[]; nextPageToken: string | null; incompleteSearch: boolean; connectionId: string; account?: "altazor" | "personal"; bindingRevision?: string; caseRevision?: string; canManage?: boolean };
type Binding = { causaId: string; connectionId: string; account: "altazor" | "personal"; revision?: string; caseRevision?: string };
type Pending = Binding & { requestId: string };
type Result = { state: "completed" | "unknown" | "pending" | "failed"; message: string; folder?: FolderChoice };

export function PersonalDriveFolderPicker({ causaId }: { causaId: string }) {
  const router = useRouter(), dialog = useRef<HTMLDialogElement>(null), binding = useRef<Binding | null>(null), epoch = useRef(0);
  const [open, setOpen] = useState(false), [trail, setTrail] = useState<FolderChoice[]>([{ id: "root", name: "Mi unidad" }]), [query, setQuery] = useState(""), [data, setData] = useState<Page | null>(null), [loading, setLoading] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState("");
  const [creating, setCreating] = useState(false), [name, setName] = useState(""), [pending, setPending] = useState<Pending | null>(null);
  const current = trail.at(-1)!;
  const currentPending = pending?.causaId === causaId ? pending : null;
  const busy = saving || Boolean(currentPending);
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController(), sequence = ++epoch.current;
    const timer = window.setTimeout(() => {
      setLoading(true); setError(""); setData(null);
      const selected = binding.current?.causaId === causaId ? binding.current : null;
      const params = new URLSearchParams({ parentId: current.id, ...(query.trim() ? { query: query.trim() } : {}), ...(selected ? { connectionId: selected.connectionId, ...(selected.revision ? { bindingRevision: selected.revision } : {}) } : {}) });
      void fetch(`/api/integrations/google/drive/${encodeURIComponent(causaId)}/folders?${params}`, { cache: "no-store", signal: controller.signal }).then(async response => {
        const body = await response.json() as Page & { error?: string };
        if (!response.ok) throw new Error(body.error || "No se pudieron consultar tus carpetas.");
        if (!body.connectionId || !Array.isArray(body.folders) || body.account === "altazor" && (!body.bindingRevision || !body.caseRevision || typeof body.canManage !== "boolean")) throw new Error("No se pudo comprobar la cuenta de esta carpeta.");
        if (!controller.signal.aborted && sequence === epoch.current) { binding.current = { causaId, connectionId: body.connectionId, account: body.account || "personal", ...(body.bindingRevision ? { revision: body.bindingRevision } : {}), ...(body.caseRevision ? { caseRevision: body.caseRevision } : {}) }; setData(body); }
      }).catch(cause => { if (!controller.signal.aborted && sequence === epoch.current) setError(cause.message); }).finally(() => { if (!controller.signal.aborted && sequence === epoch.current) setLoading(false); });
    }, query ? 300 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [open, current.id, query, causaId]);
  async function begin() {
    if (saving) return;
    binding.current = null; setTrail([{ id: "root", name: "Mi unidad" }]); setQuery(""); setError(""); setData(null); setCreating(false); setName(""); setSaving(true);
    const status = await apiMutation<{ connectionId: string | null; bindingRevision: string | null; caseRevision: string; pendingOperation?: { requestId: string } }>(`/api/causas/${encodeURIComponent(causaId)}/drive/commands`, { method: "GET", cache: "no-store" });
    if (status.ok && status.data.pendingOperation && status.data.connectionId && status.data.bindingRevision) setPending({ causaId, connectionId: status.data.connectionId, account: "altazor", revision: status.data.bindingRevision, caseRevision: status.data.caseRevision, requestId: status.data.pendingOperation.requestId });
    setSaving(false); setOpen(true);
  }
  function enter(folder: FolderChoice) { if (busy) return; const searching = Boolean(query.trim()); setQuery(""); setTrail(previous => searching ? [{ id: "root", name: "Mi unidad" }, folder] : [...previous, folder]); }
  async function more() {
    const selected = binding.current, sequence = epoch.current;
    if (!data?.nextPageToken || !selected || selected.causaId !== causaId || loading || busy) return;
    setLoading(true); setError("");
    const params = new URLSearchParams({ parentId: current.id, ...(query.trim() ? { query: query.trim() } : {}), pageToken: data.nextPageToken, connectionId: selected.connectionId, ...(selected.revision ? { bindingRevision: selected.revision } : {}), ...(selected.caseRevision ? { caseRevision: selected.caseRevision } : {}) });
    try {
      const response = await fetch(`/api/integrations/google/drive/${encodeURIComponent(causaId)}/folders?${params}`, { cache: "no-store" }); const body = await response.json() as Page & { error?: string };
      if (!response.ok) throw new Error(body.error || "No se pudieron consultar más carpetas.");
      if (body.connectionId !== selected.connectionId || body.bindingRevision !== selected.revision || body.caseRevision !== selected.caseRevision) throw new Error("La cuenta cambió. Abre de nuevo el selector.");
      if (sequence === epoch.current) setData(previous => ({ ...body, folders: [...(previous?.folders || []), ...body.folders].filter((folder, index, all) => all.findIndex(item => item.id === folder.id) === index) }));
    } catch (cause) { if (sequence === epoch.current) setError(cause instanceof Error ? cause.message : "No se pudo continuar."); }
    finally { if (sequence === epoch.current) setLoading(false); }
  }
  async function choose() {
    const selected = binding.current;
    if (current.id === "root" || !selected || selected.causaId !== causaId || busy) return;
    setSaving(true); setError("");
    const response = await apiMutation(`/api/integrations/google/drive/${encodeURIComponent(causaId)}/sync`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: selected.account === "altazor" ? "link-altazor-folder" : "link-personal-folder", folderRef: current.id, connectionId: selected.connectionId, ...(selected.revision ? { bindingRevision: selected.revision } : {}), ...(selected.caseRevision ? { caseRevision: selected.caseRevision } : {}) }) });
    setSaving(false);
    if (!response.ok) { setError(response.error); return; }
    setOpen(false); router.refresh();
  }
  async function create() {
    const selected = binding.current;
    if (!selected?.revision || !selected.caseRevision || selected.account !== "altazor" || selected.causaId !== causaId || !name.trim() || busy || data?.canManage !== true) return;
    const operation = { ...selected, requestId: crypto.randomUUID() }; setPending(operation); setSaving(true); setError("");
    const response = await apiMutation<Result>(`/api/causas/${encodeURIComponent(causaId)}/drive/commands`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create-folder", requestId: operation.requestId, connectionId: selected.connectionId, bindingRevision: selected.revision, caseRevision: selected.caseRevision, parentFolderId: current.id, nombre: name.trim(), confirmed: true }) });
    setSaving(false);
    if (response.ok && response.data.state === "failed") { setPending(null); setError(response.data.message); return; }
    if (response.ok && response.data.state === "completed" && response.data.folder?.id) { setPending(null); setOpen(false); router.refresh(); return; }
    if (!response.ok && response.status >= 400 && response.status < 500) setPending(null);
    setError(response.ok ? response.data.message : response.error);
  }
  async function reconcile() {
    if (!pending || pending.causaId !== causaId || saving) return;
    setSaving(true); setError("");
    const response = await apiMutation<Result>(`/api/causas/${encodeURIComponent(causaId)}/drive/commands`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reconcile", requestId: pending.requestId, connectionId: pending.connectionId, bindingRevision: pending.revision, confirmed: true }) });
    setSaving(false);
    if (response.ok && response.data.state === "failed") { setPending(null); setError(response.data.message); return; }
    if (response.ok && response.data.state === "completed") { setPending(null); setOpen(false); router.refresh(); return; }
    setError(response.ok ? response.data.message : response.error);
  }
  return <><button className="btn btn-primary" type="button" disabled={saving} onClick={() => void begin()}><Folder size={17} aria-hidden="true" />Elegir carpeta de Google Drive</button>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={`drive-picker-title-${causaId}`} onCancel={() => setOpen(false)} onClose={() => setOpen(false)}>
      <header className={styles.header}><div><h2 id={`drive-picker-title-${causaId}`}>Carpeta de esta causa</h2><p>{data?.account === "personal" ? "Esta carpeta usa tu conexión personal anterior." : "Usa la cuenta de Google conectada a Altazor."}</p></div><button className="btn btn-ghost" type="button" aria-label="Cerrar selector de carpetas" onClick={() => setOpen(false)}><X size={21} aria-hidden="true" /></button></header>
      <label className={styles.search}><Search size={18} aria-hidden="true" /><input value={query} maxLength={120} onChange={event => setQuery(event.target.value)} placeholder="Buscar carpetas en mi Drive" aria-label="Buscar carpetas en mi Google Drive" disabled={busy} /></label>
      <nav className={styles.breadcrumb} aria-label="Carpeta actual">{trail.map((folder,index) => <button type="button" key={`${folder.id}-${index}`} disabled={busy || index === trail.length - 1} onClick={() => { setQuery(""); setTrail(previous => previous.slice(0,index + 1)); }}>{index > 0 && <ChevronRight size={13} aria-hidden="true" />}{folder.name}</button>)}</nav>
      <div className={styles.body} aria-busy={loading}>{loading && !data && <p role="status"><LoaderCircle size={18} aria-hidden="true" />Consultando carpetas…</p>}{error && <div role="alert"><p>{error}</p>{!currentPending && <Link href="/inicio?altazor=connectors&connector=google">Revisar mi conexión de Google</Link>}</div>}
        {currentPending && <div role="status"><p>La creación no tiene confirmación. No se enviará otra solicitud.</p><button type="button" className="btn btn-secondary" disabled={saving} onClick={() => void reconcile()}>Comprobar resultado</button></div>}
        {data?.incompleteSearch && <p role="status">Google indicó que esta lista puede estar incompleta. Puedes buscar por el nombre de la carpeta.</p>}
        {data && <ul className={styles.folders}>{data.folders.map(folder => <li key={folder.id}><button type="button" onClick={() => enter(folder)} disabled={busy}><Folder size={20} aria-hidden="true" /><span>{folder.name}</span><ChevronRight size={16} aria-hidden="true" /></button></li>)}</ul>}
        {data?.folders.length === 0 && !loading && <p>{query ? "No encontramos carpetas con ese nombre." : "Esta carpeta no contiene otras carpetas."}</p>}
        {data?.nextPageToken && <button type="button" className="btn btn-ghost" disabled={loading || busy} onClick={() => void more()}>{loading ? "Consultando…" : "Ver más carpetas"}</button>}
        {data?.account === "altazor" && !data.canManage && <p className="mt-4 text-sm"><Link className="underline underline-offset-4" href="/inicio?altazor=connectors&connector=google">Permitir que Altazor cree y guarde archivos</Link></p>}
        {data?.canManage && !creating && <button type="button" className="btn btn-secondary mt-4" disabled={busy} onClick={() => setCreating(true)}><FolderPlus size={17} aria-hidden="true" />Nueva carpeta aquí</button>}
        {creating && data?.canManage && <div className="mt-4 space-y-3"><label className="block text-sm">Nombre de la carpeta<input className="input mt-1" value={name} maxLength={180} disabled={busy} onChange={event => setName(event.target.value)} /></label><p className="text-sm text-[var(--ink-soft)]">Se creará en {current.name} y se vinculará a esta causa.</p><button type="button" className="btn btn-primary" disabled={busy || !name.trim()} onClick={() => void create()}>{saving ? "Creando…" : "Crear y usar esta carpeta"}</button></div>}
      </div>
      <footer className={styles.footer}><p>La cuenta y carpeta elegidas se usan también para recibir nuevos documentos.</p><div>{trail.length > 1 && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => { setQuery(""); setTrail(previous => previous.slice(0,-1)); }}><ArrowLeft size={15} aria-hidden="true" />Volver</button>}<button type="button" className="btn btn-primary" disabled={busy || loading || current.id === "root" || !data || Boolean(error)} onClick={() => void choose()}>{saving ? "Vinculando…" : "Usar esta carpeta"}</button></div></footer>
    </dialog>
  </>;
}
