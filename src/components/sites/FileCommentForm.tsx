"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";

export function FileCommentForm({
  siteId,
  fileId,
}: {
  siteId: string;
  fileId: string;
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
    const result = await apiMutation(`/api/sites/${siteId}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "add-comment",
        fileId,
        body: fd.get("body"),
      }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "No se pudo comentar");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" className="btn btn-ghost" onClick={() => setOpen(true)}>
        Comentar
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-2 space-y-2">
      <textarea className="textarea" name="body" required rows={2} placeholder="Comentario" />
      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={busy} type="submit">
          Enviar
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
