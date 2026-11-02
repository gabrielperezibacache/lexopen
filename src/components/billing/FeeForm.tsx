"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { FEE_TIPOS } from "@/lib/billing";
import { apiMutation } from "@/lib/api-mutation";
import { BillingField } from "./BillingField";

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
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = e.currentTarget;
    const fd = new FormData(form);
    const result = await apiMutation("/api/billing/fee-arrangements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: fd.get("name"),
        tipo,
        rateHourlyClp: fd.get("rateHourlyClp") || null,
        rateHourlyUf: fd.get("rateHourlyUf") || null,
        flatFeeClp: fd.get("flatFeeClp") || null,
        retainerClp: fd.get("retainerClp") || null,
        cuotaLitisPct: fd.get("cuotaLitisPct") || null,
        notes: fd.get("notes"),
        clienteId: fd.get("clienteId") || null,
        causaId: fd.get("causaId") || null,
      }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "No se pudo guardar la tarifa");
      return;
    }
    form.reset();
    setTipo("hourly");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="panel grid grid-cols-1 gap-4 rounded-3xl p-5 sm:grid-cols-2 lg:grid-cols-3" aria-label="Guardar tarifa">
      {error && (
        <p className="sm:col-span-2 lg:col-span-3 text-sm text-[var(--danger)]" role="alert">{error}</p>
      )}
      <BillingField label="Nombre de la condición" className="sm:col-span-2"><input className="input" name="name" required placeholder="Nombre de la condición" /></BillingField>
      <BillingField label="Tipo de honorarios">
      <select className="select" value={tipo} onChange={(e) => setTipo(e.target.value)} name="tipo">
        {FEE_TIPOS.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>
      </BillingField>
      {(tipo === "hourly" || tipo === "mixed") && (
        <>
          <BillingField label="Tarifa hora CLP"><input className="input" type="number" name="rateHourlyClp" placeholder="Tarifa hora CLP" /></BillingField>
          <BillingField label="Tarifa hora UF"><input className="input" type="number" step="0.01" name="rateHourlyUf" placeholder="Tarifa hora UF" /></BillingField>
        </>
      )}
      {(tipo === "flat" || tipo === "mixed") && (
        <BillingField label="Suma alzada CLP"><input className="input" type="number" name="flatFeeClp" placeholder="Suma alzada CLP" /></BillingField>
      )}
      {(tipo === "retainer" || tipo === "mixed") && (
        <BillingField label="Retainer CLP"><input className="input" type="number" name="retainerClp" placeholder="Retainer CLP" /></BillingField>
      )}
      {(tipo === "cuota_litis" || tipo === "mixed") && (
        <BillingField label="% cuota litis"><input className="input" type="number" step="0.1" name="cuotaLitisPct" placeholder="% cuota litis" /></BillingField>
      )}
      <BillingField label="Cliente"><select className="select" name="clienteId" defaultValue="">
        <option value="">Cliente</option>
        {clientes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.razonSocial}
          </option>
        ))}
      </select></BillingField>
      <BillingField label="Causa"><select className="select" name="causaId" defaultValue="">
        <option value="">Causa</option>
        {causas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.rit || c.titulo}
          </option>
        ))}
      </select></BillingField>
      <BillingField label="Notas / condiciones" className="sm:col-span-2"><input className="input" name="notes" placeholder="Notas / condiciones" /></BillingField>
      <button className="btn btn-primary self-end" disabled={busy} type="submit">
        {busy ? 'Guardando…' : 'Guardar tarifa'}
      </button>
    </form>
  );
}
