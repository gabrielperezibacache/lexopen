"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

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
    const res = await fetch("/api/clientes", {
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
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "No se pudo crear");
      return;
    }
    const cliente = await res.json();
    router.push(`/clientes/${cliente.id}`);
  }

  if (!open) {
    return (
      <button className="btn btn-primary" type="button" onClick={() => setOpen(true)}>
        Nuevo cliente
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="panel space-y-3 rounded-3xl p-5">
      <h2 className="text-lg font-semibold">Nuevo cliente</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          className="input sm:col-span-2"
          name="razonSocial"
          required
          placeholder="Razón social / nombre"
        />
        <input className="input" name="rut" placeholder="RUT" />
        <select className="select" name="tipo" defaultValue="empresa">
          <option value="persona">Persona natural</option>
          <option value="empresa">Empresa</option>
        </select>
        <input className="input" name="email" type="email" placeholder="Email" />
        <input className="input" name="telefono" placeholder="Teléfono" />
        <select className="select sm:col-span-2" name="abogadoId" defaultValue="">
          <option value="">Sin abogado responsable</option>
          {abogados.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <textarea
          className="input sm:col-span-2"
          name="notas"
          rows={2}
          placeholder="Notas internas"
        />
      </div>
      <div className="flex flex-wrap gap-2">
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
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
    </form>
  );
}
