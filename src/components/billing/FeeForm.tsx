"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { FEE_TIPOS } from "@/lib/billing";

export function FeeForm({
  clientes,
  causas,
}: {
  clientes: Array<{ id: string; razonSocial: string }>;
  causas: Array<{ id: string; titulo: string; rit: string | null; clienteId: string | null }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [tipo, setTipo] = useState("hourly");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    await fetch("/api/billing/fee-arrangements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: fd.get("name"),
        tipo,
        rateHourlyClp: fd.get("rateHourlyClp") || null,
        flatFeeClp: fd.get("flatFeeClp") || null,
        retainerClp: fd.get("retainerClp") || null,
        cuotaLitisPct: fd.get("cuotaLitisPct") || null,
        notes: fd.get("notes"),
        clienteId: fd.get("clienteId") || null,
        causaId: fd.get("causaId") || null,
      }),
    });
    setBusy(false);
    e.currentTarget.reset();
    setTipo("hourly");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="panel grid gap-3 rounded-3xl p-5 md:grid-cols-3">
      <input className="input md:col-span-2" name="name" required placeholder="Nombre de la condición" />
      <select className="select" value={tipo} onChange={(e) => setTipo(e.target.value)} name="tipo">
        {FEE_TIPOS.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>
      {(tipo === "hourly" || tipo === "mixed") && (
        <input className="input" type="number" name="rateHourlyClp" placeholder="Tarifa hora CLP" />
      )}
      {(tipo === "flat" || tipo === "mixed") && (
        <input className="input" type="number" name="flatFeeClp" placeholder="Suma alzada CLP" />
      )}
      {(tipo === "retainer" || tipo === "mixed") && (
        <input className="input" type="number" name="retainerClp" placeholder="Retainer CLP" />
      )}
      {(tipo === "cuota_litis" || tipo === "mixed") && (
        <input className="input" type="number" step="0.1" name="cuotaLitisPct" placeholder="% cuota litis" />
      )}
      <select className="select" name="clienteId" defaultValue="">
        <option value="">Cliente</option>
        {clientes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.razonSocial}
          </option>
        ))}
      </select>
      <select className="select" name="causaId" defaultValue="">
        <option value="">Causa</option>
        {causas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.rit || c.titulo}
          </option>
        ))}
      </select>
      <input className="input md:col-span-2" name="notes" placeholder="Notas / condiciones" />
      <button className="btn btn-primary" disabled={busy} type="submit">
        Guardar tarifa
      </button>
    </form>
  );
}
