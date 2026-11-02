"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";

export function ClienteEditForm({
  cliente,
  abogados,
}: {
  cliente: {
    id: string;
    razonSocial: string;
    rut: string | null;
    email: string | null;
    telefono: string | null;
    tipo: string;
    estado: string;
    notas: string | null;
    abogadoId: string | null;
  };
  abogados: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const result = await apiMutation(`/api/clientes/${cliente.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        razonSocial: fd.get("razonSocial"),
        rut: fd.get("rut") || null,
        email: fd.get("email") || null,
        telefono: fd.get("telefono") || null,
        tipo: fd.get("tipo"),
        estado: fd.get("estado"),
        notas: fd.get("notas") || null,
        abogadoId: fd.get("abogadoId") || null,
      }),
    });
    setMsg(result.ok ? "Guardado" : "Error al guardar");
    if (result.ok) router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2">
      <label className="block space-y-2 text-sm font-medium sm:col-span-2">
        <span>Razón social / nombre</span>
        <input
        className="input"
        name="razonSocial"
        required
        defaultValue={cliente.razonSocial}
      />
      </label>
      <label className="block space-y-2 text-sm font-medium">
        <span>RUT</span>
        <input className="input" name="rut" defaultValue={cliente.rut || ""} placeholder="RUT" />
      </label>
      <label className="block space-y-2 text-sm font-medium">
        <span>Tipo</span>
        <select className="select" name="tipo" defaultValue={cliente.tipo}>
        <option value="persona">Persona natural</option>
        <option value="empresa">Empresa</option>
      </select>
      </label>
      <label className="block space-y-2 text-sm font-medium">
        <span>Email</span>
        <input
        className="input"
        name="email"
        type="email"
        defaultValue={cliente.email || ""}
        placeholder="Email"
      />
      </label>
      <label className="block space-y-2 text-sm font-medium">
        <span>Teléfono</span>
        <input
        className="input"
        name="telefono"
        defaultValue={cliente.telefono || ""}
        placeholder="Teléfono"
      />
      </label>
      <label className="block space-y-2 text-sm font-medium">
        <span>Estado</span>
        <select className="select" name="estado" defaultValue={cliente.estado}>
        <option value="activo">Activo</option>
        <option value="inactivo">Inactivo</option>
      </select>
      </label>
      <label className="block space-y-2 text-sm font-medium">
        <span>Abogado responsable</span>
        <select
        className="select"
        name="abogadoId"
        defaultValue={cliente.abogadoId || ""}
      >
        <option value="">Sin abogado responsable</option>
        {abogados.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      </label>
      <label className="block space-y-2 text-sm font-medium sm:col-span-2">
        <span>Notas</span>
        <textarea
        className="textarea"
        name="notas"
        rows={2}
        defaultValue={cliente.notas || ""}
        placeholder="Notas"
      />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button className="btn btn-secondary" type="submit">
          Guardar datos
        </button>
        {msg && <span className="text-sm text-[var(--muted)]">{msg}</span>}
      </div>
    </form>
  );
}
