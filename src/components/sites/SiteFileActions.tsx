"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function SiteFileActions({ siteId }: { siteId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState<"file" | "folder" | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    await fetch(`/api/sites/${siteId}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        open === "folder"
          ? { action: "create-folder", name: fd.get("name") }
          : {
              action: "create-file",
              name: fd.get("name"),
              contenido: fd.get("contenido"),
              tags: fd.get("tags"),
            }
      ),
    });
    setBusy(false);
    setOpen(null);
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      <button className="btn btn-ghost" type="button" onClick={() => setOpen("folder")}>
        Nueva carpeta
      </button>
      <button className="btn btn-primary" type="button" onClick={() => setOpen("file")}>
        Nuevo archivo
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <form onSubmit={submit} className="panel w-full max-w-md space-y-3 rounded-3xl p-6">
            <h3 className="text-lg font-semibold">
              {open === "folder" ? "Nueva carpeta" : "Nuevo archivo"}
            </h3>
            <input className="input" name="name" required placeholder="Nombre" />
            {open === "file" && (
              <>
                <input className="input" name="tags" placeholder="tags (csv)" />
                <textarea className="textarea" name="contenido" placeholder="Contenido markdown" />
              </>
            )}
            <div className="flex justify-end gap-2">
              <button className="btn btn-ghost" type="button" onClick={() => setOpen(null)}>
                Cancelar
              </button>
              <button className="btn btn-primary" disabled={busy} type="submit">
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
