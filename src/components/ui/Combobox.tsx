"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/chile";
import { useI18n } from "@/components/i18n/I18nProvider";

export type ComboboxOption = { value: string; label: string };

/**
 * Filterable select without Radix/cmdk — listbox pattern for lawyer pickers.
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder,
  id,
  label,
  emptyLabel,
}: {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  label?: string;
  emptyLabel?: string;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 50);
    return options.filter((o) => o.label.toLowerCase().includes(q)).slice(0, 50);
  }, [options, query]);
  const selected = options.find((o) => o.value === value);

  return (
    <div className="relative w-full">
      {label && id ? (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
          {label}
        </label>
      ) : null}
      <input
        id={id}
        className="input"
        role="combobox"
        aria-expanded={open}
        aria-controls={id ? `${id}-listbox` : undefined}
        aria-autocomplete="list"
        placeholder={placeholder || selected?.label || t("common.search")}
        value={open ? query : selected?.label || query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120);
        }}
      />
      {open && (
        <ul
          id={id ? `${id}-listbox` : undefined}
          role="listbox"
          className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-solid)] shadow-[var(--shadow)]"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-[var(--muted)]">
              {emptyLabel || t("common.noResults")}
            </li>
          ) : (
            filtered.map((o) => (
              <li key={o.value} role="option" aria-selected={o.value === value}>
                <button
                  type="button"
                  className={cn(
                    "block w-full px-3 py-2 text-left text-sm hover:bg-[var(--sea-soft)]",
                    o.value === value && "bg-[var(--sea-soft)] font-medium"
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(o.value);
                    setQuery("");
                    setOpen(false);
                  }}
                >
                  {o.label}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
