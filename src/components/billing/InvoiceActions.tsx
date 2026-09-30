"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { PAYMENT_METHODS, canRegisterInvoicePayment, clp } from "@/lib/billing";
import { apiMutation } from "@/lib/api-mutation";

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
  const [error, setError] = useState("");

  async function anular() {
    if (!window.confirm("¿Anular este borrador? El documento quedará anulado.")) return;
    setBusy(true);
    setError("");
    const result = await apiMutation(`/api/billing/invoices/${invoiceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "anulada" }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function emit() {
    setBusy(true);
    setError("");
    const result = await apiMutation(`/api/billing/invoices/${invoiceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "emitida" }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function pay(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const result = await apiMutation("/api/billing/payments", {
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
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPayOpen(false);
    router.refresh();
  }

  return (
    <div className="flex w-full min-w-0 flex-col items-stretch gap-2 sm:items-end">
      {error && (
        <p className="max-w-xs rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {status === "borrador" && (
          <button className="btn btn-secondary" type="button" disabled={busy} onClick={emit}>
            Emitir
          </button>
        )}
        {status === "borrador" && (
          <button className="btn btn-ghost" type="button" disabled={busy} onClick={anular}>
            Anular borrador
          </button>
        )}
        {canRegisterInvoicePayment(status, balanceClp) && (
          <button className="btn btn-primary" type="button" onClick={() => setPayOpen(true)}>
            Registrar pago
          </button>
        )}
      </div>
      {payOpen && (
        <form onSubmit={pay} className="panel w-full max-w-xs space-y-2 rounded-2xl p-4 sm:w-72">
          <div className="text-xs text-[var(--ink-soft)]/65">Saldo {clp(balanceClp)}</div>
          <input
            className="input"
            type="number"
            name="amountClp"
            required
            defaultValue={balanceClp}
            max={balanceClp}
          />
          <select className="select" name="method" defaultValue="transferencia" aria-label="Medio de pago">
            {PAYMENT_METHODS.map((method) => (
              <option key={method.value} value={method.value}>
                {method.label}
              </option>
            ))}
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
