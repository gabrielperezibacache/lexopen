"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/Dialog";
import { useI18n } from "@/components/i18n/I18nProvider";

export type CommandItem = {
  id: string;
  label: string;
  href: string;
  group?: string;
};

/**
 * ⌘K / Ctrl+K command palette — native dialog + filter, no cmdk package.
 */
export function CommandPalette({ items }: { items: CommandItem[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const { t } = useI18n();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 24);
    return items.filter((i) => i.label.toLowerCase().includes(q)).slice(0, 24);
  }, [items, query]);

  return (
    <Dialog
      open={open}
      onClose={() => {
        setOpen(false);
        setQuery("");
      }}
      title={t("common.commandPalette")}
    >
      <input
        className="input"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("common.searchPlaceholder")}
        aria-label={t("common.search")}
      />
      <ul className="mt-3 max-h-72 overflow-auto" role="listbox">
        {filtered.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--sea-soft)]"
              onClick={() => {
                setOpen(false);
                setQuery("");
                router.push(item.href);
              }}
            >
              <span>{item.label}</span>
              {item.group ? (
                <span className="text-xs text-[var(--muted)]">{item.group}</span>
              ) : null}
            </button>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="px-3 py-4 text-sm text-[var(--muted)]">{t("common.noResults")}</li>
        )}
      </ul>
      <p className="mt-3 text-xs text-[var(--muted)]">{t("common.commandHint")}</p>
    </Dialog>
  );
}
