"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";
import { WikiBorradorAi } from "@/components/ai/WikiBorradorAi";

export function NewWikiButton({ siteId }: { siteId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const result = await apiMutation(`/api/sites/${siteId}/wiki`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "No se pudo publicar");
      return;
    }
    setOpen(false);
    setTitle("");
    setContent("");
    router.refresh();
  }

  return (
    <>
      <button className="btn btn-primary" type="button" onClick={() => setOpen(true)}>
        Nueva página
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <form onSubmit={onSubmit} className="panel w-full max-w-lg space-y-3 rounded-3xl p-6">
            <h3 className="text-lg font-semibold">Nueva página wiki</h3>
            <WikiBorradorAi
              siteId={siteId}
              onApply={(draft) => {
                if (draft.title) setTitle(draft.title);
                if (draft.content) setContent(draft.content);
              }}
            />
            <input
              className="input"
              name="title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título"
            />
            <textarea
              className="textarea min-h-[180px]"
              name="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Escriba en Markdown: títulos (#), listas (-), negrita (**texto**)"
            />
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
                {busy ? "Publicando…" : "Publicar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
