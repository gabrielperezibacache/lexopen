"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  folderSegmentsFromRuta,
  normalizeIngestPath,
  shouldSkipIngestFile,
  sortIngestFiles,
} from "@/lib/document-ingest";

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

type FolderOption = { id: string; name: string; parentId: string | null };

export function SiteFileActions({
  siteId,
  canEdit = true,
  folders = [],
  defaultFolderId = null,
}: {
  siteId: string;
  canEdit?: boolean;
  folders?: FolderOption[];
  defaultFolderId?: string | null;
}) {
  const router = useRouter();
  const folderPickerRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState<"file" | "folder" | "import" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [folderId, setFolderId] = useState(defaultFolderId || "");
  const [importProgress, setImportProgress] = useState("");

  async function api(body: Record<string, unknown>) {
    const res = await fetch(`/api/sites/${siteId}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "No se pudo completar la acción");
    }
    return data;
  }

  async function ensureFolderPath(
    segments: string[],
    rootParentId: string | null,
    cache: Map<string, string>
  ) {
    let parentId = rootParentId;
    let pathKey = rootParentId || "root";
    for (const name of segments) {
      pathKey = `${pathKey}/${name.toLowerCase()}`;
      const existing = cache.get(pathKey);
      if (existing) {
        parentId = existing;
        continue;
      }
      const known = folders.find(
        (f) =>
          f.name.toLowerCase() === name.toLowerCase() &&
          (f.parentId || null) === (parentId || null)
      );
      if (known) {
        cache.set(pathKey, known.id);
        parentId = known.id;
        continue;
      }
      const created = await api({
        action: "create-folder",
        name,
        parentId: parentId || null,
      });
      cache.set(pathKey, created.id);
      parentId = created.id;
    }
    return parentId;
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const fd = new FormData(e.currentTarget);
      if (open === "folder") {
        await api({
          action: "create-folder",
          name: fd.get("name"),
          parentId: folderId || null,
        });
      } else {
        const file = fd.get("file");
        const binary =
          file instanceof File && file.size > 0
            ? {
                name: file.name,
                mimeType: file.type || "application/octet-stream",
                contenidoBase64: arrayBufferToBase64(await file.arrayBuffer()),
              }
            : null;
        await api({
          action: "create-file",
          name: binary?.name || fd.get("name"),
          mimeType: binary?.mimeType,
          contenidoBase64: binary?.contenidoBase64,
          contenido: fd.get("contenido"),
          tags: fd.get("tags"),
          folderId: folderId || null,
        });
      }
      setOpen(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function importFolder(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    setError("");
    setImportProgress("");
    const cache = new Map<string, string>();
    const files = sortIngestFiles(Array.from(list)).filter((f) => !shouldSkipIngestFile(f));
    let ok = 0;
    let failed = 0;
    try {
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i]!;
        const relative =
          (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        const parts = normalizeIngestPath(relative);
        if (!parts) {
          failed += 1;
          continue;
        }
        setImportProgress(`${i + 1}/${files.length}: ${parts.relativePath}`);
        const targetFolderId = await ensureFolderPath(
          folderSegmentsFromRuta(parts.ruta),
          folderId || null,
          cache
        );
        await api({
          action: "create-file",
          name: parts.nombre,
          mimeType: file.type || "application/octet-stream",
          contenidoBase64: arrayBufferToBase64(await file.arrayBuffer()),
          folderId: targetFolderId || null,
        });
        ok += 1;
      }
      setOpen(null);
      setImportProgress(`Listo: ${ok} archivo(s)${failed ? `, ${failed} omitidos` : ""}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al importar carpeta");
    } finally {
      setBusy(false);
    }
  }

  if (!canEdit) return null;

  function folderLabel(folder: FolderOption): string {
    const parts: string[] = [folder.name];
    let parentId = folder.parentId;
    const guard = new Set<string>([folder.id]);
    while (parentId) {
      if (guard.has(parentId)) break;
      guard.add(parentId);
      const parent = folders.find((f) => f.id === parentId);
      if (!parent) break;
      parts.unshift(parent.name);
      parentId = parent.parentId;
    }
    return parts.join(" / ");
  }

  const folderSelect = (
    <label className="block text-sm">
      <span className="mb-1 block text-[var(--ink-soft)]/70">Carpeta destino</span>
      <select
        className="select"
        value={folderId}
        onChange={(e) => setFolderId(e.target.value)}
      >
        <option value="">Raíz del espacio</option>
        {folders.map((f) => (
          <option key={f.id} value={f.id}>
            {folderLabel(f)}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="flex flex-wrap gap-2">
      <button
        className="btn btn-ghost"
        type="button"
        onClick={() => {
          setError("");
          setOpen("folder");
        }}
      >
        Nueva carpeta
      </button>
      <button
        className="btn btn-primary"
        type="button"
        onClick={() => {
          setError("");
          setOpen("file");
        }}
      >
        Nuevo archivo
      </button>
      <button
        className="btn btn-secondary"
        type="button"
        onClick={() => {
          setError("");
          setImportProgress("");
          setOpen("import");
        }}
      >
        Importar carpeta
      </button>
      <input
        ref={folderPickerRef}
        className="hidden"
        type="file"
        multiple
        // Chromium / Electron directory picker
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        onChange={(e) => {
          void importFolder(e.target.files);
          e.currentTarget.value = "";
        }}
      />
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <form
            onSubmit={
              open === "import"
                ? (e) => {
                    e.preventDefault();
                    folderPickerRef.current?.click();
                  }
                : submit
            }
            className="panel w-full max-w-md space-y-3 rounded-3xl p-6"
          >
            <h3 className="text-lg font-semibold">
              {open === "folder"
                ? "Nueva carpeta"
                : open === "import"
                  ? "Importar carpeta al VDR"
                  : "Nuevo archivo"}
            </h3>
            {folderSelect}
            {open === "folder" && (
              <input className="input" name="name" required placeholder="Nombre de carpeta" />
            )}
            {open === "file" && (
              <>
                <input className="input" name="name" placeholder="Nombre (opcional si sube archivo)" />
                <input className="input" name="tags" placeholder="tags (csv)" />
                <input className="input" type="file" name="file" />
                <textarea className="textarea" name="contenido" placeholder="Contenido markdown" />
              </>
            )}
            {open === "import" && (
              <p className="text-sm text-[var(--ink-soft)]/75">
                Seleccione una carpeta del disco. Se recrearán las subcarpetas bajo el destino
                elegido y se subirán los archivos.
              </p>
            )}
            {importProgress && (
              <p className="text-xs text-[var(--sea)]" role="status">
                {importProgress}
              </p>
            )}
            {error && (
              <p className="text-sm text-red-700" role="alert">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                className="btn btn-ghost"
                type="button"
                disabled={busy}
                onClick={() => setOpen(null)}
              >
                Cancelar
              </button>
              <button className="btn btn-primary" disabled={busy} type="submit">
                {busy
                  ? "…"
                  : open === "import"
                    ? "Elegir carpeta"
                    : "Guardar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
