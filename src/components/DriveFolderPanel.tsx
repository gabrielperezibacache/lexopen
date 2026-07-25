"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderOpen, Link2, Unlink } from "lucide-react";

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

  async function run(action: string, extra: Record<string, unknown> = {}) {
    setMsg("");
    setError("");
    const res = await fetch("/api/integrations/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, causaId, ...extra }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Error");
      return;
    }
    setMsg(
      data.message ||
        (data.status === "created"
          ? "Carpeta creada y vinculada"
          : data.status === "linked" || data.status === "linked_stub"
            ? "Carpeta vinculada"
            : data.status === "unlinked"
              ? "Carpeta desvinculada"
              : "Listo")
    );
    setFolderRef("");
    router.refresh();
  }

  return (
    <section className="panel rounded-3xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Google Drive</h2>
          <p className="mt-1 text-sm text-[var(--ink-soft)]/75">
            Enlace el expediente digital de la causa a una carpeta determinada.
            Documentos y minutas se suben ahí.
          </p>
        </div>
        <FolderOpen className="text-[var(--copper)]" size={20} />
      </div>

      {folderId ? (
        <div className="mt-4 rounded-2xl border border-[var(--line)] bg-white/70 px-4 py-3">
          <div className="text-sm font-medium">
            {folderName || "Carpeta vinculada"}
          </div>
          <div className="mt-1 break-all text-xs text-[var(--ink-soft)]/65">
            ID: {folderId}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {folderUrl && (
              <a
                href={folderUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary"
              >
                Abrir en Drive
              </a>
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
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--ink-soft)]/70">
              URL o ID de carpeta existente
            </span>
            <input
              className="input"
              value={folderRef}
              onChange={(e) => setFolderRef(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/…"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-secondary"
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
          </div>
        </div>
      )}

      {msg && (
        <p className="mt-3 text-sm text-[var(--sea)]">{msg}</p>
      )}
      {error && (
        <p className="mt-3 text-sm text-red-700">{error}</p>
      )}
    </section>
  );
}
