"use client";

import { Dialog } from "@/components/ui/Dialog";
import { WorkspaceField } from "./WorkspaceField";

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
        <Dialog open onClose={() => setOpen(false)} title="Nueva iSheet">
          <form onSubmit={onSubmit} className="space-y-4">
            <WorkspaceField label="Nombre"><input className="input" name="name" required placeholder="Nombre" /></WorkspaceField>
            <WorkspaceField label="Descripción"><textarea className="textarea" name="description" placeholder="Descripción" /></WorkspaceField>
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
        </Dialog>
      )}
    </>
  );
}
