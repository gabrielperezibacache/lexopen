"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Column = { key: string; name: string; type: string; options: string };
type Row = { id: string; data: Record<string, string> };

export function ISheetTable({
  siteId,
  sheetId,
  columns,
  rows,
}: {
  siteId: string;
  sheetId: string;
  columns: Column[];
  rows: Row[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function addRow(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data: Record<string, string> = {};
    for (const c of columns) data[c.key] = String(fd.get(c.key) || "");
    await fetch(`/api/sites/${siteId}/isheets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add-row", sheetId, data }),
    });
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="panel overflow-hidden rounded-3xl">
      <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
        <span className="text-sm text-[var(--ink-soft)]/70">{rows.length} registros</span>
        <button className="btn btn-primary" type="button" onClick={() => setOpen(true)}>
          Nueva fila
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[var(--ink)] text-white/90">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className="px-4 py-3 font-medium">
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="table-row">
                {columns.map((c) => (
                  <td key={c.key} className="px-4 py-3">
                    {r.data[c.key] || "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <form onSubmit={addRow} className="panel w-full max-w-md space-y-3 rounded-3xl p-6">
            <h3 className="text-lg font-semibold">Nueva fila</h3>
            {columns.map((c) =>
              c.type === "choice" ? (
                <select key={c.key} className="select" name={c.key} defaultValue="">
                  <option value="">Seleccione {c.name}</option>
                  {c.options.split(",").map((o) => (
                    <option key={o.trim()} value={o.trim()}>
                      {o.trim()}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  key={c.key}
                  className="input"
                  name={c.key}
                  type={c.type === "date" ? "date" : c.type === "number" ? "number" : "text"}
                  placeholder={c.name}
                />
              )
            )}
            <div className="flex justify-end gap-2">
              <button className="btn btn-ghost" type="button" onClick={() => setOpen(false)}>
                Cancelar
              </button>
              <button className="btn btn-primary" type="submit">
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
