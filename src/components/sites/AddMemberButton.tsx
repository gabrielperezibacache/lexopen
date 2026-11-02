"use client";

import { Dialog } from "@/components/ui/Dialog";
import { WorkspaceField } from "./WorkspaceField";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";

export function AddMemberButton({
  siteId,
  users,
}: {
  siteId: string;
  users: Array<{ id: string; name: string; email: string }>;
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
    const result = await apiMutation(`/api/sites/${siteId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: fd.get("userId"),
        role: fd.get("role"),
      }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "No se pudo agregar la persona");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button className="btn btn-primary" type="button" onClick={() => setOpen(true)}>
        Agregar persona
      </button>
      {open && (
        <Dialog open onClose={() => setOpen(false)} title="Agregar al espacio">
          <form onSubmit={onSubmit} className="space-y-4">
            <WorkspaceField label="Persona"><select className="select" name="userId" required defaultValue="">
              <option value="" disabled>
                Seleccione usuario
              </option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} · {u.email}
                </option>
              ))}
            </select></WorkspaceField>
            <WorkspaceField label="Rol en el espacio"><select className="select" name="role" defaultValue="contributor">
              <option value="admin">Administrador</option>
              <option value="contributor">Colaborador</option>
              <option value="viewer">Solo lectura</option>
              <option value="client">Cliente</option>
            </select></WorkspaceField>
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
                {busy ? "Agregando…" : "Agregar"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
