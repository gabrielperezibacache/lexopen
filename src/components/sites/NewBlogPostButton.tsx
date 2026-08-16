"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";

export function NewBlogPostButton({ siteId }: { siteId: string }) {
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
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: fd.get("title"),
        body: fd.get("body"),
        published: true,
      }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "No se pudo publicar");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        Nueva publicación
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="panel w-full max-w-xl space-y-3 rounded-3xl p-5">
      <input className="input" name="title" required placeholder="Título" />
      <textarea
        className="textarea"
        name="body"
        required
        rows={8}
        placeholder="Contenido Markdown"
      />
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={busy} type="submit">
          Publicar
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
