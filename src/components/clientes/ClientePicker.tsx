"use client";
import { useId, useState } from "react";
type Option = { id: string; razonSocial: string; rut: string | null };
export function ClientePicker({
  initial,
  value,
  onChange,
}: {
  initial: Option[];
  value: string;
  onChange: (id: string) => void;
}) {
  const id = useId();
  const [items, setItems] = useState(initial),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function search() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/clientes?${new URLSearchParams({ q: query, limit: "50" })}`,
        { cache: "no-store" },
      );
      if (!response.ok)
        throw Error(
          "No se pudieron buscar los clientes. Tu selección se conserva.",
        );
      const rows: Option[] = await response.json();
      setItems((old) => [
        ...new Map(
          [...old.filter((item) => item.id === value), ...rows].map((item) => [
            item.id,
            item,
          ]),
        ).values(),
      ]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="min-w-0 space-y-2">
      <label className="block text-sm font-medium" htmlFor={id}>
        Cliente
      </label>
      <select
        className="select"
        id={id}
        name="clienteId"
        disabled={busy}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Sin cliente</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.razonSocial}
            {item.rut ? ` · ${item.rut}` : ""}
          </option>
        ))}
      </select>
      <div className="flex flex-wrap gap-2">
        <input
          className="input min-w-0 flex-1"
          aria-label="Buscar cliente"
          maxLength={200}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void search();
            }
          }}
          placeholder="Nombre o RUT"
        />
        <button
          className="btn btn-secondary"
          type="button"
          disabled={busy}
          onClick={() => void search()}
        >
          Buscar cliente
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
