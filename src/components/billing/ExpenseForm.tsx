"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { EXPENSE_CATEGORIES } from "@/lib/billing";
import { apiMutation } from "@/lib/api-mutation";

export function ExpenseForm({
  causas,
  clientes,
}: {
  causas: Array<{ id: string; titulo: string; rit: string | null; clienteId: string | null }>;
  clientes: Array<{ id: string; razonSocial: string }>;
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
    const causaId = String(fd.get("causaId") || "");
    const causa = causas.find((c) => c.id === causaId);
    const result = await apiMutation("/api/billing/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: fd.get("date"),
        description: fd.get("description"),
        category: fd.get("category"),
        amountClp: Number(fd.get("amountClp")),
        vendor: fd.get("vendor"),
        causaId: causaId || null,
        clienteId: fd.get("clienteId") || causa?.clienteId || null,
        billable: true,
        reimbursable: true,
      }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    form.reset();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="panel grid grid-cols-1 gap-3 rounded-3xl p-5 sm:grid-cols-2 lg:grid-cols-3">
      {error && (
        <p className="md:col-span-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}
      <input className="input" type="date" name="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
      <select className="select" name="category" defaultValue="notario">
        {EXPENSE_CATEGORIES.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
      <input className="input" type="number" name="amountClp" required placeholder="Monto CLP" />
      <input className="input md:col-span-2" name="description" required placeholder="Descripción" />
      <input className="input" name="vendor" placeholder="Proveedor" />
      <select className="select" name="causaId" defaultValue="">
        <option value="">Sin causa</option>
        {causas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.rit || c.titulo}
          </option>
        ))}
      </select>
      <select className="select" name="clienteId" defaultValue="">
        <option value="">Cliente</option>
        {clientes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.razonSocial}
          </option>
        ))}
      </select>
      <button className="btn btn-primary" disabled={busy} type="submit">
        Registrar gasto
      </button>
    </form>
  );
}
