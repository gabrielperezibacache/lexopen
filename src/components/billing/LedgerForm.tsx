"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";

export function LedgerForm({
  clienteId,
  causas,
}: {
  clienteId: string;
  causas: Array<{ id: string; rit: string | null; titulo: string }>;
}) {
  const router = useRouter();
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
    const result = await apiMutation("/api/billing/ledger", {
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
    if (!result.ok) {
      setError(result.error || "No se pudo registrar el movimiento");
      return;
    }
    form.reset();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="panel grid grid-cols-1 gap-3 rounded-3xl p-5 sm:grid-cols-2 lg:grid-cols-4">
      {error && (
        <p className="sm:col-span-2 lg:col-span-4 text-sm text-[var(--danger)]">{error}</p>
      )}
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
