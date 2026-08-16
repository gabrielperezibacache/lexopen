"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";

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
  const [editing, setEditing] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function addRow(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const data: Record<string, string> = {};
    for (const c of columns) data[c.key] = String(fd.get(c.key) || "");
    const result = await apiMutation(`/api/sites/${siteId}/isheets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add-row", sheetId, data }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "No se pudo agregar la fila");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  async function saveEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const data: Record<string, string> = {};
    for (const c of columns) data[c.key] = String(fd.get(c.key) || "");
    const result = await apiMutation(`/api/sites/${siteId}/isheets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update-row", rowId: editing.id, data }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "No se pudo actualizar la fila");
      return;
    }
    setEditing(null);
    router.refresh();
  }

  async function deleteRow(rowId: string) {
    if (!confirm("¿Eliminar esta fila?")) return;
    setBusy(true);
    setError("");
    const result = await apiMutation(`/api/sites/${siteId}/isheets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete-row", rowId }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "No se pudo eliminar la fila");
      return;
    }
    router.refresh();
  }

  function fieldInputs(defaults?: Record<string, string>) {
    return columns.map((c) =>
      c.type === "choice" ? (
        <select
          key={c.key}
          className="select"
          name={c.key}
          defaultValue={defaults?.[c.key] || ""}
        >
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
          defaultValue={defaults?.[c.key] || ""}
        />
      )
    );
  }

  return (
    <div className="panel overflow-hidden rounded-3xl">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-3">
        <span className="text-sm text-[var(--ink-soft)]/70">{rows.length} registros</span>
        <button className="btn btn-primary" type="button" onClick={() => setOpen(true)}>
          Nueva fila
        </button>
      </div>
      {error && (
        <p className="border-b border-[var(--line)] px-4 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[var(--ink)] text-white/90">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className="px-4 py-3 font-medium">
                  {c.name}
                </th>
              ))}
              <th className="px-4 py-3 font-medium">Acciones</th>
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
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={busy}
                      onClick={() => setEditing(r)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={busy}
                      onClick={() => deleteRow(r.id)}
                    >
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <form onSubmit={addRow} className="panel w-full max-w-md space-y-3 rounded-3xl p-6">
            <h3 className="text-lg font-semibold">Nueva fila</h3>
            {fieldInputs()}
            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
            <div className="flex justify-end gap-2">
              <button className="btn btn-ghost" type="button" onClick={() => setOpen(false)}>
                Cancelar
              </button>
              <button className="btn btn-primary" type="submit" disabled={busy}>
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <form onSubmit={saveEdit} className="panel w-full max-w-md space-y-3 rounded-3xl p-6">
            <h3 className="text-lg font-semibold">Editar fila</h3>
            {fieldInputs(editing.data)}
            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
            <div className="flex justify-end gap-2">
              <button className="btn btn-ghost" type="button" onClick={() => setEditing(null)}>
                Cancelar
              </button>
              <button className="btn btn-primary" type="submit" disabled={busy}>
                Actualizar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
