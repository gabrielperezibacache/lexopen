"use client";
import { useId, useState } from "react";
type Option = { id: string; label: string; version?: number };
/** Search keeps selected and initial options, so typing never changes a draft selection. */
export function DeadlineOptions({
  kind = "cause",
  causaId,
  initial = [],
  value,
  initialValue,
  onChange,
  name,
  label,
  empty = "Sin causa",
  required = false,
}: {
  kind?: "cause" | "document";
  causaId?: string | null;
  initial?: Option[];
  value?: string;
  initialValue?: string;
  onChange?: (value: string, version?: number) => void;
  name?: string;
  label: string;
  empty?: string;
  required?: boolean;
}) {
  const id = useId(),
    [items, setItems] = useState(initial),
    [q, setQ] = useState(""),
    [next, setNext] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function search(after?: string) {
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams({
        kind,
        q,
        ...(causaId ? { causaId } : {}),
        ...(after ? { after } : {}),
      });
      const r = await fetch(`/api/plazos/options?${params}`, {
        cache: "no-store",
      });
      if (!r.ok) throw Error("No se pudieron buscar las opciones");
      const data = await r.json();
      setItems((old) =>
        Array.from(
          new Map(
            [...old, ...data.items].map((x: Option) => [x.id, x]),
          ).values(),
        ),
      );
      setNext(data.next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        className="select w-full"
        name={name}
        value={value}
        defaultValue={initialValue}
        onChange={(e) =>
          onChange?.(
            e.target.value,
            items.find((i) => i.id === e.target.value)?.version,
          )
        }
        required={required}
      >
        <option value="">{empty}</option>
        {items.map((i) => (
          <option key={i.id} value={i.id}>
            {i.label}
            {i.version ? ` · v${i.version}` : ""}
          </option>
        ))}
      </select>
      <div className="flex flex-wrap gap-2">
        <input
          className="input min-w-0 flex-1"
          aria-label={`Buscar ${label.toLowerCase()}`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void search();
            }
          }}
          placeholder="Buscar por nombre o RIT"
        />
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => void search()}
        >
          Buscar
        </button>
        {next && (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => void search(next)}
          >
            Más resultados
          </button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
