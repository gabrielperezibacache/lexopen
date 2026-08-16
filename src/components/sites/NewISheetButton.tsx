"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";

export function NewISheetButton({ siteId }: { siteId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const result = await apiMutation<{ id: string }>(`/api/sites/${siteId}/isheets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create-sheet",
        name: fd.get("name"),
        description: fd.get("description"),
      }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "No se pudo crear la iSheet");
      return;
    }
    router.push(`/sites/${siteId}/isheets/${result.data.id}`);
    router.refresh();
  }

  return (
    <>
      <button className="btn btn-primary" type="button" onClick={() => setOpen(true)}>
        Nueva iSheet
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <form onSubmit={onSubmit} className="panel w-full max-w-md space-y-3 rounded-3xl p-6">
            <h3 className="text-lg font-semibold">Nueva iSheet</h3>
            <input className="input" name="name" required placeholder="Nombre" />
            <textarea className="textarea" name="description" placeholder="Descripción" />
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
                {busy ? "Creando…" : "Crear"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
