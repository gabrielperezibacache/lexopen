"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DOC_TIPOS, clp } from "@/lib/billing";

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
}: {
  clientes: Array<{ id: string; razonSocial: string }>;
  causas: Array<{ id: string; titulo: string; rit: string | null; clienteId: string | null }>;
  timeEntries: Item[];
  expenses: Item[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedTime, setSelectedTime] = useState<string[]>([]);
  const [selectedExp, setSelectedExp] = useState<string[]>([]);
  const [clienteId, setClienteId] = useState(clientes[0]?.id || "");
  const [causaId, setCausaId] = useState("");
  const [tipo, setTipo] = useState("boleta_honorarios");
  const [busy, setBusy] = useState(false);

  const preview = useMemo(() => {
    const t = timeEntries.filter((x) => selectedTime.includes(x.id));
    const e = expenses.filter((x) => selectedExp.includes(x.id));
    return t.reduce((s, x) => s + x.amountClp, 0) + e.reduce((s, x) => s + x.amountClp, 0);
  }, [selectedTime, selectedExp, timeEntries, expenses]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const due = new Date();
    due.setDate(due.getDate() + 30);
    const res = await fetch("/api/billing/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clienteId,
        causaId: causaId || null,
        tipoDocumento: tipo,
        status: "emitida",
        dueDate: due.toISOString(),
        timeEntryIds: selectedTime,
        expenseIds: selectedExp,
        glosa: "Honorarios profesionales y gastos asociados",
      }),
    });
    setBusy(false);
    if (res.ok) {
      const inv = await res.json();
      router.push(`/facturacion/facturas/${inv.id}`);
      router.refresh();
    }
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
            Seleccione horas y gastos no facturados para generar boleta/factura.
          </p>
        </div>
        <button className="btn btn-primary" type="button" onClick={() => setOpen((v) => !v)}>
          {open ? "Cerrar" : "Nueva emisión"}
        </button>
      </div>

      {open && (
        <form onSubmit={onSubmit} className="mt-5 space-y-4 border-t border-[var(--line)] pt-5">
          <div className="grid gap-3 md:grid-cols-3">
            <select className="select" value={clienteId} onChange={(e) => setClienteId(e.target.value)} required>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.razonSocial}
                </option>
              ))}
            </select>
            <select className="select" value={causaId} onChange={(e) => setCausaId(e.target.value)}>
              <option value="">Sin causa</option>
              {causas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.rit || c.titulo}
                </option>
              ))}
            </select>
            <select className="select" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {DOC_TIPOS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold">Horas</h3>
              <div className="max-h-48 space-y-2 overflow-auto">
                {timeEntries.map((t) => (
                  <label key={t.id} className="flex items-start gap-2 rounded-xl border border-[var(--line)] px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedTime.includes(t.id)}
                      onChange={() => toggle(selectedTime, t.id, setSelectedTime)}
                    />
                    <span>
                      {t.label}
                      <span className="mt-0.5 block text-xs text-[var(--ink-soft)]/65">{clp(t.amountClp)}</span>
                    </span>
                  </label>
                ))}
                {timeEntries.length === 0 && (
                  <p className="text-sm text-[var(--ink-soft)]/60">No hay horas pendientes.</p>
                )}
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">Gastos</h3>
              <div className="max-h-48 space-y-2 overflow-auto">
                {expenses.map((t) => (
                  <label key={t.id} className="flex items-start gap-2 rounded-xl border border-[var(--line)] px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedExp.includes(t.id)}
                      onChange={() => toggle(selectedExp, t.id, setSelectedExp)}
                    />
                    <span>
                      {t.label}
                      <span className="mt-0.5 block text-xs text-[var(--ink-soft)]/65">{clp(t.amountClp)}</span>
                    </span>
                  </label>
                ))}
                {expenses.length === 0 && (
                  <p className="text-sm text-[var(--ink-soft)]/60">No hay gastos pendientes.</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              Subtotal seleccionado: <strong>{clp(preview)}</strong>
            </div>
            <button
              className="btn btn-primary"
              disabled={busy || (!selectedTime.length && !selectedExp.length)}
              type="submit"
            >
              {busy ? "Emitiendo…" : "Emitir documento"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
