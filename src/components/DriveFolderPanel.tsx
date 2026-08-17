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

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  modifiedTime?: string;
};

type Props = {
  causaId: string;
  folderId?: string | null;
  folderName?: string | null;
  folderUrl?: string | null;
};

export function DriveFolderPanel({
  causaId,
  folderId,
  folderName,
  folderUrl,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [folderRef, setFolderRef] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [files, setFiles] = useState<DriveFile[] | null>(null);

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
      files?: DriveFile[];
    }>("/api/integrations/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, causaId, ...extra }),
    });
    if (!result.ok) {
      setError(result.error || "Error");
      return result;
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
                : data.status === "ok"
                  ? `${(data.files || []).length} archivo(s) en Drive`
                  : "Listo")
    );
    if (action === "list-causa-folder") {
      setFiles(Array.isArray(data.files) ? data.files : []);
    } else {
      setFolderRef("");
      setFiles(null);
      router.refresh();
    }
    return data;
  }

  return (
    <section className="panel rounded-3xl p-5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Google Drive</h2>
          <p className="mt-1 text-sm text-[var(--ink-soft)]/75">
            Enlace el expediente digital de la causa a una carpeta. Preferimos
            «Crear carpeta en Drive» (scope <code>drive.file</code>). Luego puede
            subir documentos y minutas.
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
                  startTransition(() => run("list-causa-folder"))
                }
              >
                <RefreshCw size={14} className="mr-1 inline" />
                Ver archivos
              </button>
            )}
            {isPlaceholder && (
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
            <button
              type="button"
              className="btn btn-ghost"
              disabled={pending}
              onClick={() =>
                startTransition(() => run("unlink-causa-folder"))
              }
            >
              <Unlink size={14} className="mr-1 inline" />
              Desvincular
            </button>
          </div>
          {files && (
            <ul className="mt-3 space-y-1 border-t border-[var(--line)] pt-3 text-sm">
              {files.length === 0 ? (
                <li className="text-[var(--ink-soft)]/65">
                  Carpeta vacía o sin archivos visibles para LexOpen.
                </li>
              ) : (
                files.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-baseline gap-2">
                    <span className="font-medium">{f.name}</span>
                    <span className="text-xs text-[var(--ink-soft)]/60">
                      {f.mimeType.replace("application/vnd.google-apps.", "")}
                    </span>
                    <a
                      href={f.webViewLink || driveFileUrl(f.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-[var(--sea)] underline"
                    >
                      Abrir
                    </a>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
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
        </div>
      )}

      {msg && (
        <p className="mt-3 text-sm text-[var(--sea)]" role="status">
          {msg}
        </p>
      )}
      {error && (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
