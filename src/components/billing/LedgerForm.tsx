"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSubmissionKeys } from "@/lib/client-submission-key";
import { apiMutation } from "@/lib/api-mutation";
import { BillingField } from "./BillingField";

export function LedgerForm({
  clienteId,
  causas,
}: {
  clienteId: string;
  causas: Array<{ id: string; rit: string | null; titulo: string }>;
}) {
  const router = useRouter();
  const keys = useRef(createSubmissionKeys(undefined, `lexopen:ledger:${clienteId}`));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = e.currentTarget;
    const fd = new FormData(form);
    const tipo = String(fd.get("tipo"));
    const amount = Number(fd.get("amountClp"));
    const isCredit = tipo === "provision" || tipo === "pago" || tipo === "reembolso";
    const payload = { clienteId, causaId: fd.get("causaId") || null, tipo, description: fd.get("description"), creditClp: isCredit ? amount : 0, debitClp: isCredit ? 0 : amount };
    const result = await apiMutation("/api/billing/ledger", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": keys.current.forPayload(payload) }, body: JSON.stringify(payload) });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "No se pudo registrar el movimiento");
      return;
    }
    keys.current.complete(payload);
    form.reset();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="panel grid grid-cols-1 gap-4 rounded-3xl p-5 sm:grid-cols-2 lg:grid-cols-4" aria-label="Registrar movimiento de cuenta corriente">
      {error && (
        <p className="sm:col-span-2 lg:col-span-4 text-sm text-[var(--danger)]" role="alert">{error}</p>
      )}
      <BillingField label="Tipo de movimiento"><select className="select" name="tipo" defaultValue="provision">
        <option value="provision">Provisión de fondos</option>
        <option value="ajuste">Ajuste</option>
        <option value="reembolso">Reembolso al cliente</option>
        <option value="cargo_gasto">Cargo gasto</option>
      </select></BillingField>
      <BillingField label="Monto CLP"><input className="input" type="number" name="amountClp" required placeholder="Monto CLP" /></BillingField>
      <BillingField label="Causa"><select className="select" name="causaId" defaultValue="">
        <option value="">Sin causa</option>
        {causas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.rit || c.titulo}
          </option>
        ))}
      </select></BillingField>
      <button className="btn btn-primary self-end" disabled={busy} type="submit">
        {busy ? 'Registrando…' : 'Registrar'}
      </button>
      <BillingField label="Descripción del movimiento" className="sm:col-span-2 lg:col-span-4"><input className="input" name="description" required placeholder="Descripción del movimiento" /></BillingField>
    </form>
  );
}
