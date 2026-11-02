"use client";

import { Dialog } from "@/components/ui/Dialog";
import { WorkspaceField } from "./WorkspaceField";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";

export function EditWikiButton({
  siteId,
  page,
}: {
  siteId: string;
  page: { id: string; title: string; content: string };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const result = await apiMutation(`/api/sites/${siteId}/wiki`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: page.id,
        title: fd.get("title"),
        content: fd.get("content"),
      }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "No se pudo guardar");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button className="btn btn-ghost" type="button" onClick={() => setOpen(true)}>
        Editar
      </button>
      {open && (
        <Dialog open onClose={() => setOpen(false)} title="Editar página">
          <form onSubmit={onSubmit} className="space-y-4">
            <WorkspaceField label="Título"><input
              className="input"
              name="title"
              required
              defaultValue={page.title}
              placeholder="Título"
            /></WorkspaceField>
            <WorkspaceField label="Contenido en Markdown"><textarea
              className="textarea min-h-[220px]"
              name="content"
              defaultValue={page.content}
              placeholder="Contenido en Markdown"
            /></WorkspaceField>
            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                className="btn btn-ghost"
                type="button"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Cancelar
              </button>
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
