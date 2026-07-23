"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { clp } from "@/lib/billing";

export function InvoiceActions({
  invoiceId,
  status,
  clienteId,
  balanceClp,
}: {
  invoiceId: string;
  status: string;
  clienteId: string;
  balanceClp: number;
}) {
  const router = useRouter();
  const [payOpen, setPayOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function emit() {
    setBusy(true);
    await fetch(`/api/billing/invoices/${invoiceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "emitida" }),
    });
    setBusy(false);
    router.refresh();
  }

  async function pay(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    await fetch("/api/billing/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invoiceId,
        clienteId,
        amountClp: Number(fd.get("amountClp")),
        method: fd.get("method"),
        reference: fd.get("reference"),
      }),
    });
    setBusy(false);
    setPayOpen(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2">
        {status === "borrador" && (
          <button className="btn btn-secondary" type="button" disabled={busy} onClick={emit}>
            Emitir
          </button>
        )}
        {balanceClp > 0 && status !== "anulada" && (
          <button className="btn btn-primary" type="button" onClick={() => setPayOpen(true)}>
            Registrar pago
          </button>
        )}
      </div>
      {payOpen && (
        <form onSubmit={pay} className="panel w-72 space-y-2 rounded-2xl p-4">
          <div className="text-xs text-[var(--ink-soft)]/65">Saldo {clp(balanceClp)}</div>
          <input
            className="input"
            type="number"
            name="amountClp"
            required
            defaultValue={balanceClp}
            max={balanceClp}
          />
          <select className="select" name="method" defaultValue="transferencia">
            <option value="transferencia">Transferencia</option>
            <option value="cheque">Cheque</option>
            <option value="efectivo">Efectivo</option>
            <option value="tarjeta">Tarjeta</option>
          </select>
          <input className="input" name="reference" placeholder="Nº transferencia / ref." />
          <div className="flex gap-2">
            <button className="btn btn-ghost" type="button" onClick={() => setPayOpen(false)}>
              Cancelar
            </button>
            <button className="btn btn-primary" disabled={busy} type="submit">
              Guardar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
