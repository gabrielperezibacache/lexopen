"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function NewSiteButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/sites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: fd.get("name"),
        description: fd.get("description"),
        tipo: fd.get("tipo"),
      }),
    });
    setBusy(false);
    if (res.ok) {
      const site = await res.json();
      router.push(`/sites/${site.id}`);
      router.refresh();
    }
  }

  return (
    <>
      <button className="btn btn-primary" type="button" onClick={() => setOpen(true)}>
        Nuevo espacio
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <form onSubmit={onSubmit} className="panel w-full max-w-md space-y-3 rounded-3xl p-6">
            <h2 className="text-xl font-semibold">Crear espacio</h2>
            <input className="input" name="name" required placeholder="Nombre del espacio" />
            <textarea className="textarea" name="description" placeholder="Descripción" />
            <select className="select" name="tipo" defaultValue="matter">
              <option value="matter">Matter / causa</option>
              <option value="vdr">VDR / data room</option>
              <option value="client_portal">Portal cliente</option>
              <option value="project">Proyecto</option>
              <option value="knowledge">Knowledge / playbooks</option>
            </select>
            <div className="flex justify-end gap-2">
              <button className="btn btn-ghost" type="button" onClick={() => setOpen(false)}>
                Cancelar
              </button>
              <button className="btn btn-primary" disabled={busy} type="submit">
                {busy ? "Creando…" : "Crear"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
