"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowDownToLine, FileText, FolderPlus } from "lucide-react";
import { apiMutation } from "@/lib/api-mutation";
import type { OrganizationAction } from "@/lib/causas/document-organization";
import { DocumentDriveAction } from "@/components/DocumentDriveAction";

type Folder = { id: string; name: string; parentId: string | null };
type Destination = { id: string; path: string; ancestorIds: string[] };
type ArchiveDocument = {
  id: string;
  name: string;
  route: string | null;
  status: string | null;
  folder: string | null;
  source: string;
  hasStudyCopy: boolean;
  copyToStudyFolderId: string | null;
  assistantHref: string | null;
};

function documentStatus(value: string | null) {
  if (value === "completed") return "Texto disponible";
  if (value === "failed" || value === "needs_ocr") return "Revisar lectura";
  if (value === "pending" || value === "queued" || value === "processing") return "Preparando texto";
  return null;
}

export function CaseArchiveOrganizer({
  causaId, folder, folders, canWrite, documents, showPlacement,
}: {
  causaId: string;
  folder: Folder | null;
  folders: Destination[];
  canWrite: boolean;
  documents: ArchiveDocument[];
  showPlacement: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function organize(action: OrganizationAction, success: string) {
    if (pending) return false;
    setPending(true);
    setNotice("");
    setError("");
    const result = await apiMutation<{ moved?: number }>(`/api/causas/${encodeURIComponent(causaId)}/expediente`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    setNotice(action.action === "move-documents" && !result.data.moved ? "Los documentos ya estaban en esa ubicación." : success);
    router.refresh();
    return true;
  }

  function createFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") || "");
    void organize({ action: "create-folder", name, parentId: folder?.id ?? null }, "Carpeta creada.").then(saved => {
      if (saved) form.reset();
    });
  }

  function renameFolder(event: FormEvent<HTMLFormElement>, folderId: string) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") || "");
    void organize({ action: "rename-folder", folderId, name }, "Nombre actualizado.");
  }

  function moveFolder(event: FormEvent<HTMLFormElement>, folderId: string) {
    event.preventDefault();
    const parentId = String(new FormData(event.currentTarget).get("destination") || "") || null;
    void organize({ action: "move-folder", folderId, parentId }, "Carpeta movida.");
  }

  function moveDocuments(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const folderId = String(new FormData(event.currentTarget).get("destination") || "") || null;
    void organize({ action: "move-documents", documentIds: checked, folderId }, "Documentos movidos.").then(saved => {
      if (saved) setChecked([]);
    });
  }

  return <div className="space-y-3">
    {canWrite && <details className="border-b border-[var(--line)] pb-2">
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-[var(--sea)]">
        {folder ? "Organizar carpeta" : "Nueva carpeta"}
      </summary>
      <div className="grid gap-4 pb-3 lg:grid-cols-2">
        <form onSubmit={createFolder} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
          <label className="grid min-w-0 gap-1.5 text-sm font-medium">
            {folder ? "Nombre de la subcarpeta" : "Nombre de la carpeta"}
            <input className="input min-w-0" name="name" required maxLength={120} disabled={pending} />
          </label>
          <button className="btn btn-secondary" disabled={pending}><FolderPlus size={17} aria-hidden="true" />Crear</button>
        </form>
        {folder && <>
          <form onSubmit={event => renameFolder(event, folder.id)} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
            <label className="grid min-w-0 gap-1.5 text-sm font-medium">
              Cambiar nombre
              <input key={folder.name} className="input min-w-0" name="name" defaultValue={folder.name} required maxLength={120} disabled={pending} />
            </label>
            <button className="btn btn-secondary" disabled={pending}>Guardar</button>
          </form>
          <form onSubmit={event => moveFolder(event, folder.id)} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
            <label className="grid min-w-0 gap-1.5 text-sm font-medium">
              Mover carpeta a
              <select key={folder.parentId || "root"} className="select min-w-0" name="destination" defaultValue={folder.parentId || ""} disabled={pending}>
                <option value="">Expediente</option>
                {folders.filter(item => item.id !== folder.id && !item.ancestorIds.includes(folder.id)).map(item => <option key={item.id} value={item.id}>{item.path}</option>)}
              </select>
            </label>
            <button className="btn btn-secondary" disabled={pending}>Mover</button>
          </form>
        </>}
      </div>
    </details>}
    <div role="status" className="text-sm text-[var(--sea)]">{pending ? "Guardando cambios…" : notice}</div>
    {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
    {checked.length > 0 && <form onSubmit={moveDocuments} className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
      <label className="grid min-w-0 gap-1.5 text-sm font-medium">
        Mover {checked.length === 1 ? "1 documento" : `${checked.length} documentos`} a
        <select className="select min-w-0" name="destination" aria-label="Carpeta de destino" defaultValue={folder?.id || ""} disabled={pending}>
          <option value="">Expediente</option>
          {folders.map(item => <option key={item.id} value={item.id}>{item.path}</option>)}
        </select>
      </label>
      <button className="btn btn-primary" disabled={pending}>Mover seleccionados</button>
    </form>}

    {documents.length ? <ul className="divide-y divide-[var(--line)] border-b border-[var(--line)]" aria-label="Documentos">
      {documents.map(document => {
        const status = documentStatus(document.status);
        const filePath = `/api/documentos/${encodeURIComponent(document.id)}/content`;
        return <li key={document.id} className="grid gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="flex min-w-0 items-start gap-2">
            {canWrite && <label className="grid min-h-11 min-w-11 shrink-0 cursor-pointer place-items-center">
              <input type="checkbox" aria-label={`Seleccionar ${document.name}`} checked={checked.includes(document.id)} disabled={pending}
                onChange={event => {
                  const selected = event.currentTarget.checked;
                  setChecked(current => selected ? [...current, document.id] : current.filter(id => id !== document.id));
                }} />
            </label>}
            <div className="min-w-0 pt-1.5">
              <Link href={`/documentos/${encodeURIComponent(document.id)}/fuentes`} className="inline-flex min-h-11 items-start gap-2 break-all text-sm font-semibold text-[var(--ink)] hover:text-[var(--sea)]">
                <FileText size={17} className="mt-0.5 shrink-0" aria-hidden="true" />{document.name}
              </Link>
              <p className="flex flex-wrap gap-x-2 text-xs leading-relaxed text-[var(--muted)]">
                <span>{document.source}</span>
                {document.source !== "LexOpen" && <span>· Copia en LexOpen</span>}
                {document.hasStudyCopy && <span>· Copia del estudio en Drive</span>}
                {status && <span>· {status}</span>}
              </p>
              {document.route && <p className="mt-1 break-all text-xs text-[var(--muted)]">Carpeta de origen · {document.route}</p>}
              {showPlacement && <p className="mt-1 break-all text-xs text-[var(--muted)]">Ubicación · {document.folder || "Expediente"}</p>}
            </div>
          </div>
          <div className="flex flex-wrap items-start gap-x-3 text-sm sm:justify-end">
            {document.assistantHref && <Link className="inline-flex min-h-11 items-center text-[var(--sea)] hover:underline" href={document.assistantHref}>Consultar con Altazor</Link>}
            <details>
              <summary className="min-h-11 cursor-pointer py-3 text-[var(--sea)]">Opciones</summary>
              <div className="flex flex-col items-start">
                <a className="inline-flex min-h-11 items-center gap-2 text-[var(--sea)] hover:underline" href={filePath}><ArrowDownToLine size={16} aria-hidden="true" />Descargar</a>
                {document.copyToStudyFolderId && <DocumentDriveAction documentId={document.id} studyFolderId={document.copyToStudyFolderId} hasBinary hasText={false} />}
              </div>
            </details>
          </div>
        </li>;
      })}
    </ul> : <p className="py-5 text-sm text-[var(--muted)]">No hay documentos en esta vista. {canWrite ? "Puedes incorporar archivos al expediente o cambiar los filtros." : "Revisa otra carpeta o cambia los filtros."}</p>}
  </div>;
}
