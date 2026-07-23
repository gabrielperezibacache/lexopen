"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function LedgerForm({
  clienteId,
  causas,
}: {
  clienteId: string;
  causas: Array<{ id: string; rit: string | null; titulo: string }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const tipo = String(fd.get("tipo"));
    const amount = Number(fd.get("amountClp"));
    const isCredit = tipo === "provision" || tipo === "pago" || tipo === "reembolso";
    await fetch("/api/billing/ledger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clienteId,
        causaId: fd.get("causaId") || null,
        tipo,
        description: fd.get("description"),
        creditClp: isCredit ? amount : 0,
        debitClp: isCredit ? 0 : amount,
      }),
    });
    setBusy(false);
    e.currentTarget.reset();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="panel grid gap-3 rounded-3xl p-5 md:grid-cols-4">
      <select className="select" name="tipo" defaultValue="provision">
        <option value="provision">Provisión de fondos</option>
        <option value="ajuste">Ajuste</option>
        <option value="reembolso">Reembolso al cliente</option>
        <option value="cargo_gasto">Cargo gasto</option>
      </select>
      <input className="input" type="number" name="amountClp" required placeholder="Monto CLP" />
      <select className="select" name="causaId" defaultValue="">
        <option value="">Sin causa</option>
        {causas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.rit || c.titulo}
          </option>
        ))}
      </select>
      <button className="btn btn-primary" disabled={busy} type="submit">
        Registrar
      </button>
      <input className="input md:col-span-4" name="description" required placeholder="Descripción del movimiento" />
    </form>
  );
}
