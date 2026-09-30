"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BOLETA_RETENCION_RATE,
  DOC_TIPOS,
  IVA_RATE,
  clp,
  computeInvoiceTotals,
  formatPercentRate,
} from "@/lib/billing";
import { apiMutation } from "@/lib/api-mutation";

type Item = {
  id: string;
  label: string;
  amountClp: number;
  clienteId: string | null;
  causaId: string | null;
};

export function CreateInvoicePanel({
  clientes,
  causas,
  timeEntries,
  expenses,
  ivaRate,
  retencionRate,
}: {
  clientes: Array<{ id: string; razonSocial: string }>;
  causas: Array<{ id: string; titulo: string; rit: string | null; clienteId: string | null }>;
  timeEntries: Item[];
  expenses: Item[];
  ivaRate?: number;
  retencionRate?: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedTime, setSelectedTime] = useState<string[]>([]);
  const [selectedExp, setSelectedExp] = useState<string[]>([]);
  const [clienteId, setClienteId] = useState(clientes[0]?.id || "");
  const [causaId, setCausaId] = useState("");
  const [tipo, setTipo] = useState("boleta_honorarios");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const iva = typeof ivaRate === "number" ? ivaRate : IVA_RATE;
  const retencion = typeof retencionRate === "number" ? retencionRate : BOLETA_RETENCION_RATE;
  const causasCliente = causas.filter((causa) => causa.clienteId === clienteId);
  const visibleTime = timeEntries.filter((item) => matchesScope(item, clienteId, causaId));
  const visibleExpenses = expenses.filter((item) => matchesScope(item, clienteId, causaId));
  const chosenTime = visibleTime.filter((item) => selectedTime.includes(item.id));
  const chosenExpenses = visibleExpenses.filter((item) => selectedExp.includes(item.id));
  const horasSinCliente = timeEntries.filter((item) => !item.clienteId).length;
  const gastosSinCliente = expenses.filter((item) => !item.clienteId).length;

  const preview = previewTotals(chosenTime, chosenExpenses, tipo, iva, retencion);

  function selectCliente(nextId: string) {
    setClienteId(nextId);
    setCausaId("");
    setSelectedTime((prev) =>
      prev.filter((id) => timeEntries.find((item) => item.id === id)?.clienteId === nextId)
    );
    setSelectedExp((prev) =>
      prev.filter((id) => expenses.find((item) => item.id === id)?.clienteId === nextId)
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!chosenTime.length && !chosenExpenses.length) return;
    setBusy(true);
    setError("");
    const due = new Date();
    due.setDate(due.getDate() + 30);
    const result = await apiMutation<{ id: string }>("/api/billing/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clienteId,
        causaId: causaId || null,
        tipoDocumento: tipo,
        status: "emitida",
        dueDate: due.toISOString(),
        timeEntryIds: chosenTime.map((item) => item.id),
        expenseIds: chosenExpenses.map((item) => item.id),
        glosa: "Honorarios profesionales y gastos asociados",
      }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "No se pudo emitir el documento");
      return;
    }
    router.push(`/facturacion/facturas/${result.data.id}`);
    router.refresh();
  }

  function toggle(list: string[], id: string, setter: (v: string[]) => void) {
    setter(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  return (
    <div className="panel rounded-3xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Emitir documento</h2>
          <p className="text-sm text-[var(--ink-soft)]/75">
            Solo se listan horas y gastos del cliente elegido. El total incluye IVA o retención según el tipo.
          </p>
        </div>
        <button
          className="btn btn-primary"
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Cerrar" : "Nueva emisión"}
        </button>
      </div>

      {open && clientes.length === 0 && (
        <p className="mt-4 text-sm text-[var(--ink-soft)]/70">
          Registre un cliente antes de emitir una boleta o factura.
        </p>
      )}

      {open && clientes.length > 0 && (
        <form onSubmit={onSubmit} className="mt-5 space-y-4 border-t border-[var(--line)] pt-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-[var(--ink-soft)]/60">
              Cliente
              <select
                className="select"
                value={clienteId}
                onChange={(e) => selectCliente(e.target.value)}
                required
              >
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.razonSocial}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-[var(--ink-soft)]/60">
              Causa
              <select className="select" value={causaId} onChange={(e) => setCausaId(e.target.value)}>
                <option value="">Sin causa</option>
                {causasCliente.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.rit || c.titulo}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-[var(--ink-soft)]/60">
              Tipo
              <select className="select" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {DOC_TIPOS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ItemList
              title="Horas"
              items={visibleTime}
              selected={selectedTime}
              empty="Este cliente no tiene horas por facturar."
              onToggle={(id) => toggle(selectedTime, id, setSelectedTime)}
            />
            <ItemList
              title="Gastos"
              items={visibleExpenses}
              selected={selectedExp}
              empty="Este cliente no tiene gastos por facturar."
              onToggle={(id) => toggle(selectedExp, id, setSelectedExp)}
            />
          </div>

          {(horasSinCliente > 0 || gastosSinCliente > 0) && (
            <p className="text-sm text-[var(--ink-soft)]/70">
              {horasSinCliente > 0 ? `${horasSinCliente} hora(s)` : ""}
              {horasSinCliente > 0 && gastosSinCliente > 0 ? " y " : ""}
              {gastosSinCliente > 0 ? `${gastosSinCliente} gasto(s)` : ""} sin cliente. Asigne un
              cliente antes de incluirlos.
            </p>
          )}

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1 text-sm">
              {preview ? (
                <>
                  <div className="flex justify-between gap-6">
                    <span>Neto</span>
                    <span>{clp(preview.subtotalClp)}</span>
                  </div>
                  {preview.ivaClp > 0 && (
                    <div className="flex justify-between gap-6">
                      <span>IVA {formatPercentRate(iva)}</span>
                      <span>{clp(preview.ivaClp)}</span>
                    </div>
                  )}
                  {preview.retencionClp > 0 && (
                    <div className="flex justify-between gap-6">
                      <span>Retención {formatPercentRate(retencion)}</span>
                      <span>-{clp(preview.retencionClp)}</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-6 font-semibold">
                    <span>Total a cobrar</span>
                    <span>{clp(preview.totalClp)}</span>
                  </div>
                </>
              ) : (
                <span className="text-[var(--ink-soft)]/65">Seleccione horas o gastos del cliente.</span>
              )}
              <p className="text-xs text-[var(--ink-soft)]/60">
                Cálculo interno con las tasas del estudio. No es un DTE del SII.
              </p>
            </div>
            <button
              className="btn btn-primary"
              disabled={busy || !preview}
              type="submit"
            >
              {busy ? "Emitiendo…" : "Emitir documento"}
            </button>
          </div>
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        </form>
      )}
    </div>
  );
}

function previewTotals(
  time: Item[],
  expenses: Item[],
  tipo: string,
  ivaRate: number,
  retencionRate: number
) {
  const lines = [...time, ...expenses].map((item) => ({ amountClp: item.amountClp }));
  if (!lines.length) return null;
  try {
    return computeInvoiceTotals({ tipoDocumento: tipo, lines, ivaRate, retencionRate });
  } catch {
    return null;
  }
}

function matchesScope(item: Item, clienteId: string, causaId: string) {
  if (!clienteId || item.clienteId !== clienteId) return false;
  if (causaId && item.causaId !== causaId) return false;
  return true;
}

function ItemList({
  title,
  items,
  selected,
  empty,
  onToggle,
}: {
  title: string;
  items: Item[];
  selected: string[];
  empty: string;
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <div className="max-h-48 space-y-2 overflow-auto">
        {items.map((item) => (
          <label
            key={item.id}
            className="flex items-start gap-2 rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
          >
            <input
              type="checkbox"
              checked={selected.includes(item.id)}
              onChange={() => onToggle(item.id)}
            />
            <span>
              {item.label}
              <span className="mt-0.5 block text-xs text-[var(--ink-soft)]/65">{clp(item.amountClp)}</span>
            </span>
          </label>
        ))}
        {items.length === 0 && <p className="text-sm text-[var(--ink-soft)]/60">{empty}</p>}
      </div>
    </div>
  );
}
