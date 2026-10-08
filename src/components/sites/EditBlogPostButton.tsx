"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";

export function EditBlogPostButton({
  siteId,
  post,
}: {
  siteId: string;
  post: { id: string; title: string; body: string; published: boolean };
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
    const result = await apiMutation(`/api/sites/${siteId}/blog`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: post.id,
        title: fd.get("title"),
        body: fd.get("body"),
        published: fd.get("published") === "on",
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

  if (!open) {
    return (
      <button type="button" className="btn btn-ghost" onClick={() => setOpen(true)}>
        Editar
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-3 rounded-2xl border border-[var(--line)] p-4">
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Título</span>
        <input
          className="input w-full"
          name="title"
          required
          defaultValue={post.title}
          placeholder="Ej: Actualización del caso..."
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Contenido</span>
        <textarea
          className="textarea w-full"
          name="body"
          required
          rows={6}
          defaultValue={post.body}
          placeholder="Escriba el contenido en Markdown..."
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="published" defaultChecked={post.published} />
        Publicado
      </label>
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={busy} type="submit">
          {busy ? "Guardando…" : "Guardar"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => setOpen(false)}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
