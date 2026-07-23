"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function NewWikiButton({ siteId }: { siteId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await fetch(`/api/sites/${siteId}/wiki`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: fd.get("title"),
        content: fd.get("content"),
      }),
    });
    setOpen(false);
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
            <h3 className="text-lg font-semibold">Nueva wiki</h3>
            <input className="input" name="title" required placeholder="Título" />
            <textarea className="textarea min-h-[180px]" name="content" placeholder="Markdown" />
            <div className="flex justify-end gap-2">
              <button className="btn btn-ghost" type="button" onClick={() => setOpen(false)}>
                Cancelar
              </button>
              <button className="btn btn-primary" type="submit">
                Publicar
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
