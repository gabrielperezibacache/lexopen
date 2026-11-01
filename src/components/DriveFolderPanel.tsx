"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderOpen, Link2, Unlink, RefreshCw } from "lucide-react";
import {
  driveFileUrl,
  isPlaceholderDriveFolderId,
  isRealDriveFolderId,
} from "@/lib/integrations/drive-folder";
import { apiMutation } from "@/lib/api-mutation";
import type { DriveImportCandidate } from "@/lib/integrations/drive-import";

type Props = {
  causaId: string;
  folderId?: string | null;
  folderName?: string | null;
  folderUrl?: string | null;
  canImport?: boolean;
};

export function DriveFolderPanel({
  causaId,
  folderId,
  folderName,
  folderUrl,
  canImport = false,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [folderRef, setFolderRef] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [files, setFiles] = useState<DriveImportCandidate[] | null>(null);
  const [listedFolderId, setListedFolderId] = useState<string | null>(null);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [selection, setSelection] = useState<string | null>(null);
  const [incompleteSearch, setIncompleteSearch] = useState(false);
  const [importedHref, setImportedHref] = useState<string | null>(null);
  const selectedFile = listedFolderId === folderId ? files?.find(file => file.id === selection) : null;

  const isPlaceholder = isPlaceholderDriveFolderId(folderId);
  const isReal = isRealDriveFolderId(folderId);
  const canOpenExternal =
    Boolean(folderUrl) &&
    folderUrl!.startsWith("https://drive.google.com/") &&
    isReal;

  async function run(action: string, extra: Record<string, unknown> = {}) {
    setMsg("");
    setError("");
    const result = await apiMutation<{
      error?: string;
      message?: string;
      status?: string;
    }>("/api/integrations/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, causaId, ...extra }),
    });
    if (!result.ok) {
      setError(result.error || "Error");
      return;
    }
    const data = result.data;
    setMsg(
      data.message ||
        (data.status === "created"
          ? "Carpeta creada y vinculada"
          : data.status === "linked" || data.status === "linked_offline"
            ? "Carpeta vinculada"
            : data.status === "stub"
              ? "Marcador local guardado (no es Drive real)"
              : data.status === "unlinked"
                ? "Carpeta desvinculada"
                : "Listo")
    );
    setFolderRef(""); setFiles(null); setSelection(null); setImportedHref(null);
    router.refresh();
  }

  async function listFiles(pageToken?: string) {
    setMsg(""); setError(""); setSelection(null); setImportedHref(null);
    const result = await apiMutation<{ folderId: string; files: DriveImportCandidate[]; nextPageToken: string | null; incompleteSearch: boolean }>(`/api/integrations/google/drive/${encodeURIComponent(causaId)}${pageToken ? `?${new URLSearchParams({ pageToken })}` : ""}`, { method: "GET", cache: "no-store" });
    if (!result.ok) { setError(result.error); return; }
    setFiles(result.data.files); setListedFolderId(result.data.folderId); setNextPageToken(result.data.nextPageToken); setIncompleteSearch(result.data.incompleteSearch);
  }

  async function importSelected() {
    if (!selectedFile?.version || !listedFolderId) return;
    setMsg(""); setError(""); setImportedHref(null);
    const result = await apiMutation<{ documentoId: string; href: string; reused: boolean }>(`/api/integrations/google/drive/${encodeURIComponent(causaId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folderId: listedFolderId, fileId: selectedFile.id, version: selectedFile.version }) });
    if (!result.ok) { setError(result.error); return; }
    setMsg(result.data.reused ? "Esta revisión ya está guardada en el expediente." : "Copia guardada en el expediente; su texto se procesará localmente.");
    setImportedHref(`/documentos/${encodeURIComponent(result.data.documentoId)}/fuentes`);
    router.refresh();
  }

  return (
    <section className="panel rounded-3xl p-5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Google Drive</h2>
          <p className="mt-1 text-sm text-[var(--ink-soft)]/75">
            Vincule una carpeta y elija qué archivos conservar en el expediente.
            La copia queda en LexOpen con su revisión y procedencia; los cambios
            posteriores en Drive requieren una nueva importación.
          </p>
        </div>
        <FolderOpen className="text-[var(--copper)]" size={20} />
      </div>

      {folderId ? (
        <div className="mt-4 rounded-2xl border border-[var(--line)] bg-white/70 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-medium">
              {folderName || "Carpeta vinculada"}
            </div>
            {isPlaceholder ? (
              <span className="badge badge-pendiente">stub / demo</span>
            ) : (
              <span className="badge badge-activa">Drive</span>
            )}
          </div>
          <div className="mt-1 break-all text-xs text-[var(--ink-soft)]/65">
            ID: {folderId}
          </div>
          {isPlaceholder && (
            <p className="mt-2 text-xs text-[var(--ink-soft)]/70">
              Marcador local: no abre Google Drive. Conecte OAuth y cree una
              carpeta real para subir documentos.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {canOpenExternal && (
              <a
                href={folderUrl!}
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary"
              >
                Abrir en Drive
              </a>
            )}
            {isReal && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={pending}
                onClick={() =>
                  startTransition(() => listFiles())
                }
              >
                <RefreshCw size={14} className="mr-1 inline" />
                Elegir archivos de Drive
              </button>
            )}
            {isPlaceholder && canImport && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={pending}
                onClick={() =>
                  startTransition(() => run("create-causa-folder"))
                }
              >
                Crear carpeta real
              </button>
            )}
            {canImport && <button
              type="button"
              className="btn btn-ghost"
              disabled={pending}
              onClick={() =>
                startTransition(() => run("unlink-causa-folder"))
              }
            >
              <Unlink size={14} className="mr-1 inline" />
              Desvincular
            </button>}
          </div>
          {files && listedFolderId === folderId && (
            <div className="mt-4 min-w-0 border-t border-[var(--line)] pt-4">
              <p className="mb-3 text-sm text-[var(--ink-soft)]/80">Sólo se muestran los archivos de esta carpeta visibles para la cuenta conectada a LexOpen. Cada página contiene hasta 50 archivos.</p>
              {incompleteSearch && <p className="mb-3 text-sm" role="status">Drive indicó una búsqueda incompleta. Esta lista puede omitir archivos.</p>}
            <ul className="space-y-3 text-sm">
              {files.length === 0 ? (
                <li className="text-[var(--ink-soft)]/65">
                  Carpeta vacía o sin archivos visibles para LexOpen.
                </li>
              ) : (
                files.map((f) => (
                  <li key={f.id} className="min-w-0">
                    <label className="flex items-start gap-3">
                    {canImport && <input type="radio" name={`drive-selection-${causaId}`} className="mt-1 shrink-0" checked={selection === f.id} disabled={pending || !f.importable} onChange={() => { setSelection(f.id); setMsg(""); setError(""); setImportedHref(null); }} aria-label={`Seleccionar ${f.name}`} />}
                    <span className="min-w-0"><span className="block break-words font-medium">{f.name}</span>
                    <span className="mt-1 block break-all text-sm text-[var(--ink-soft)]/75">
                      {f.mimeType.replace("application/vnd.google-apps.", "")} · Revisión {f.version || "no informada"}{f.sizeBytes !== null ? ` · ${new Intl.NumberFormat("es-CL").format(f.sizeBytes)} bytes` : ""}
                    </span>
                    {f.reason && <span className="mt-1 block text-sm text-[var(--ink-soft)]/80">{f.reason}</span>}
                    <a
                      href={driveFileUrl(f.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block text-sm text-[var(--sea)] underline"
                    >
                      Abrir en Drive
                    </a>
                    </span></label>
                  </li>
                ))
              )}
            </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => startTransition(() => listFiles())}>Primera página</button>
                {nextPageToken && <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => startTransition(() => listFiles(nextPageToken))}>Página siguiente</button>}
              </div>
              {selectedFile && <div className="mt-5 min-w-0 border-t border-[var(--line)] pt-4">
                <h3 className="font-semibold">Revisar la copia elegida</h3>
                <p className="mt-2 break-words text-sm">{selectedFile.name}</p>
                <p className="mt-1 text-sm text-[var(--ink-soft)]/80">Revisión {selectedFile.version}. {selectedFile.exportMimeType ? selectedFile.exportMimeType === "application/pdf" ? "Se conservará una exportación PDF de este documento de Google." : "Se conservará una exportación XLSX de esta planilla de Google." : "Se conservará el archivo original."}</p>
                {selectedFile.modifiedTime && <p className="mt-1 break-words text-sm text-[var(--ink-soft)]/80">Modificado en Drive: {selectedFile.modifiedTime}</p>}
                <p className="mt-2 text-sm text-[var(--ink-soft)]/80">Se copiará sólo este archivo. Conservará los permisos de la causa y no se actualizará automáticamente desde Drive.</p>
                <button type="button" className="btn btn-primary mt-3" disabled={pending || !selectedFile.importable} onClick={() => startTransition(importSelected)}>{pending ? "Guardando copia…" : "Guardar copia elegida en LexOpen"}</button>
              </div>}
            </div>
          )}
        </div>
      ) : (
        canImport ? <div className="mt-4 space-y-3">
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending}
            onClick={() =>
              startTransition(() => run("create-causa-folder"))
            }
          >
            Crear carpeta en Drive
          </button>
          <details className="rounded-2xl border border-[var(--line)] bg-white/50 p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Vincular carpeta existente (avanzado)
            </summary>
            <p className="mt-2 text-xs text-[var(--ink-soft)]/70">
              Con <code>drive.file</code> solo se pueden verificar carpetas
              creadas o abiertas por esta app. Si falla, use «Crear carpeta».
            </p>
            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-[var(--ink-soft)]/70">
                URL o ID de carpeta
              </span>
              <input
                className="input"
                value={folderRef}
                onChange={(e) => setFolderRef(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/…"
                aria-label="URL o ID de carpeta Google Drive"
              />
            </label>
            <button
              type="button"
              className="btn btn-secondary mt-3"
              disabled={pending || !folderRef.trim()}
              onClick={() =>
                startTransition(() =>
                  run("link-causa-folder", { folderRef: folderRef.trim() })
                )
              }
            >
              <Link2 size={14} className="mr-1 inline" />
              Vincular carpeta
            </button>
          </details>
        </div> : <p className="mt-4 text-sm text-[var(--ink-soft)]/80">Esta causa todavía no tiene una carpeta vinculada.</p>
      )}

      {msg && (
        <p className="mt-3 text-sm text-[var(--sea)]" role="status">
          {msg}
        </p>
      )}
      {importedHref && <a className="mt-2 inline-block text-sm text-[var(--sea)] underline" href={importedHref}>Abrir copia en el expediente</a>}
      {error && (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
