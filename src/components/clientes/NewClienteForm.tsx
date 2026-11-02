"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";
import { Dialog } from "@/components/ui/Dialog";
import { Plus } from "lucide-react";

export function NewClienteForm({
  abogados,
}: {
  abogados: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const result = await apiMutation<{ id: string }>("/api/clientes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        razonSocial: fd.get("razonSocial"),
        rut: fd.get("rut") || null,
        email: fd.get("email") || null,
        telefono: fd.get("telefono") || null,
        tipo: fd.get("tipo") || "persona",
        estado: "activo",
        notas: fd.get("notas") || null,
        abogadoId: fd.get("abogadoId") || null,
      }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "No se pudo crear");
      return;
    }
    router.push(`/clientes/${result.data.id}`);
  }

  return (
    <>
      <button className="btn btn-primary" type="button" onClick={() => setOpen(true)}>
        <Plus size={16} aria-hidden="true" /> Nuevo cliente
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Nuevo cliente" className="!w-[min(40rem,calc(100vw-1.5rem))]">
      {open && <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block space-y-2 text-sm font-medium sm:col-span-2">
          <span>Razón social / nombre</span>
        <input
          className="input"
          name="razonSocial"
          required
          placeholder="Razón social / nombre"
        />
        </label>
        <label className="block space-y-2 text-sm font-medium">
          <span>RUT</span>
        <input className="input" name="rut" placeholder="RUT" />
        </label>
        <label className="block space-y-2 text-sm font-medium">
          <span>Tipo</span>
        <select className="select" name="tipo" defaultValue="empresa">
          <option value="persona">Persona natural</option>
          <option value="empresa">Empresa</option>
        </select>
        </label>
        <label className="block space-y-2 text-sm font-medium">
          <span>Email</span>
        <input className="input" name="email" type="email" placeholder="Email" />
        </label>
        <label className="block space-y-2 text-sm font-medium">
          <span>Teléfono</span>
        <input className="input" name="telefono" placeholder="Teléfono" />
        </label>
        <label className="block space-y-2 text-sm font-medium sm:col-span-2">
          <span>Abogado responsable</span>
        <select className="select" name="abogadoId" defaultValue="">
          <option value="">Sin abogado responsable</option>
          {abogados.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        </label>
        <label className="block space-y-2 text-sm font-medium sm:col-span-2">
          <span>Notas internas</span>
        <textarea
          className="textarea"
          name="notas"
          rows={2}
          placeholder="Notas internas"
        />
        </label>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-[var(--line)] pt-4">
        <button className="btn btn-primary" disabled={busy} type="submit">
          {busy ? "Guardando…" : "Crear cliente"}
        </button>
        <button
          className="btn btn-ghost"
          type="button"
          onClick={() => setOpen(false)}
        >
          Cancelar
        </button>
      </div>
      {error && <p className="text-sm text-[var(--danger)]" role="alert">{error}</p>}
    </form>}
    </Dialog>
    </>
  );
}
