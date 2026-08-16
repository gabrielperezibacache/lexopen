"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";

export function QaActions({
  siteId,
  threadId,
  reply,
  canMarkAnswer = true,
}: {
  siteId: string;
  threadId?: string;
  reply?: boolean;
  canMarkAnswer?: boolean;
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
    let result;
    if (reply && threadId) {
      result = await apiMutation(`/api/sites/${siteId}/qa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reply",
          threadId,
          body: fd.get("body"),
          isAnswer: fd.get("isAnswer") === "on",
        }),
      });
    } else {
      result = await apiMutation(`/api/sites/${siteId}/qa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-thread",
          subject: fd.get("subject"),
          category: fd.get("category"),
          body: fd.get("body"),
        }),
      });
    }
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "No se pudo publicar");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (reply) {
    return (
      <div className="mt-3">
        {!open ? (
          <button className="btn btn-ghost" type="button" onClick={() => setOpen(true)}>
            Responder
          </button>
        ) : (
          <form onSubmit={onSubmit} className="mt-2 space-y-2">
            <textarea className="textarea" name="body" required placeholder="Respuesta" />
            {canMarkAnswer && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isAnswer" /> Marcar como respuesta oficial
              </label>
            )}
            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
            <div className="flex gap-2">
              <button className="btn btn-primary" type="submit" disabled={busy}>
                {busy ? "Enviando…" : "Enviar"}
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>
    );
  }

  return (
    <>
      <button className="btn btn-primary" type="button" onClick={() => setOpen(true)}>
        Nueva pregunta
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <form onSubmit={onSubmit} className="panel w-full max-w-md space-y-3 rounded-3xl p-6">
            <h3 className="text-lg font-semibold">Nueva pregunta Q&A</h3>
            <input className="input" name="subject" required placeholder="Asunto" />
            <input className="input" name="category" placeholder="Categoría" />
            <textarea className="textarea" name="body" required placeholder="Detalle" />
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
