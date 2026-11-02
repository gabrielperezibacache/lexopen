"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PAYMENT_METHODS, canRegisterInvoicePayment, clp } from "@/lib/billing";
import { apiMutation } from "@/lib/api-mutation";
import { createSubmissionKeys } from "@/lib/client-submission-key";
import { Dialog } from "@/components/ui/Dialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { BillingField } from "./BillingField";

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
  const [cancelOpen, setCancelOpen] = useState(false);
  const [loadingAction, setLoadingAction] = useState<"anular" | "emitir" | "pagar" | null>(null);
  const [error, setError] = useState("");
  const paymentSubmission = useMemo(() => createSubmissionKeys(undefined, `lexopen:payment:${invoiceId}`), [invoiceId]);

  async function anular() {
    setLoadingAction("anular");
    setError("");
    try {
      const result = await apiMutation(`/api/billing/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "anulada" }),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCancelOpen(false);
      router.refresh();
    } finally {
      setLoadingAction(null);
    }
  }

  async function emit() {
    setLoadingAction("emitir");
    setError("");
    try {
      const result = await apiMutation(`/api/billing/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "emitida" }),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    } finally {
      setLoadingAction(null);
    }
  }

  async function pay(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoadingAction("pagar");
    setError("");
    try {
      const fd = new FormData(e.currentTarget);
      const payload = {
        invoiceId, clienteId, amountClp: Number(fd.get("amountClp")),
        method: fd.get("method"), reference: fd.get("reference"),
      };
      const result = await apiMutation("/api/billing/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": paymentSubmission.forPayload(payload) },
        body: JSON.stringify(payload),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      paymentSubmission.complete(payload);
      setPayOpen(false);
      router.refresh();
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <div className="flex w-full min-w-0 flex-col items-stretch gap-2 sm:items-end">
      {error && !payOpen && (
        <p className="max-w-xs rounded-xl border border-[var(--danger)]/25 bg-[var(--danger)]/5 px-3 py-2 text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {status === "borrador" && (
          <button className="btn btn-secondary" type="button" disabled={loadingAction !== null} onClick={emit}>
            {loadingAction === "emitir" ? "Emitiendo…" : "Emitir"}
          </button>
        )}
        {status === "borrador" && (
          <button className="btn btn-ghost" type="button" disabled={loadingAction !== null} onClick={() => { setError(""); setCancelOpen(true); }}>
            {loadingAction === "anular" ? "Anulando…" : "Anular borrador"}
          </button>
        )}
        {canRegisterInvoicePayment(status, balanceClp) && (
          <button className="btn btn-primary" type="button" aria-haspopup="dialog" onClick={() => setPayOpen(true)}>
            Registrar pago
          </button>
        )}
      </div>
      {payOpen && (
        <Dialog open onClose={() => setPayOpen(false)} title="Registrar pago">
        <form onSubmit={pay} className="space-y-4">
          <div className="text-sm text-[var(--ink-soft)]">Saldo <strong className="font-semibold tabular-nums text-[var(--ink)]">{clp(balanceClp)}</strong></div>
          <BillingField label="Monto CLP"><input
            className="input"
            type="number"
            name="amountClp"
            required
            defaultValue={balanceClp}
            max={balanceClp}
          /></BillingField>
          <BillingField label="Medio de pago"><select className="select" name="method" defaultValue="transferencia" aria-label="Medio de pago">
            {PAYMENT_METHODS.map((method) => (
              <option key={method.value} value={method.value}>
                {method.label}
              </option>
            ))}
          </select></BillingField>
          <BillingField label="Nº transferencia / ref."><input className="input" name="reference" placeholder="Nº transferencia / ref." /></BillingField>
          {error && <p className="text-sm text-[var(--danger)]" role="alert">{error}</p>}
          <div className="flex gap-2">
            <button className="btn btn-ghost" type="button" onClick={() => setPayOpen(false)}>
              Cancelar
            </button>
            <button className="btn btn-primary" disabled={loadingAction !== null} type="submit">
              {loadingAction === "pagar" ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
        </Dialog>
      )}
      <ConfirmDialog open={cancelOpen} onClose={() => setCancelOpen(false)} onConfirm={anular} title="¿Anular este borrador?" description={error || "El documento quedará anulado."} confirmLabel="Anular borrador" busy={loadingAction === "anular"} />
    </div>
  );
}
