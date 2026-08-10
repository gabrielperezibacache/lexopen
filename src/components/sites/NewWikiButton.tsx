"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AiAssist, type AiActionResponse } from "@/components/ai/AiAssist";

export function NewWikiButton({ siteId }: { siteId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await fetch(`/api/sites/${siteId}/wiki`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        content,
      }),
    });
    setOpen(false);
    setTitle("");
    setContent("");
    router.refresh();
  }

  function applyAi(result: AiActionResponse) {
    const data = result.data as { title?: string; content?: string } | null;
    if (data?.title) setTitle(data.title);
    if (data?.content) setContent(data.content);
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
            <AiAssist
              action="wiki.borrador"
              siteId={siteId}
              label="Borrador IA"
              showPreview={false}
              onResult={applyAi}
            />
            <input
              className="input"
              name="title"
              required
              placeholder="Título"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              className="textarea min-h-[180px]"
              name="content"
              placeholder="Escriba en Markdown: títulos (#), listas (-), negrita (**texto**)"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setOpen(false)}
              >
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
