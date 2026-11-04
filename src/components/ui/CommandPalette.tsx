"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/Dialog";
import { useI18n } from "@/components/i18n/I18nProvider";

export type CommandItem = { id: string; label: string; href: string; group?: string; keywords?: string };
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();

/** Section navigation, distinct from the global case/document search. */
export function CommandPalette({ items, open, onOpenChange }: { items: CommandItem[]; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [query, setQuery] = useState("");
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { t } = useI18n();
  function close() { onOpenChange(false); setQuery(""); }
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);
  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return q ? items.filter(item => normalize(`${item.label} ${item.group || ""} ${item.keywords || ""}`).includes(q)) : items;
  }, [items, query]);
  function navigate(item: CommandItem) { close(); router.push(item.href); }
  function resultKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowDown") { event.preventDefault(); buttons.current[(index + 1) % filtered.length]?.focus(); }
    if (event.key === "ArrowUp") { event.preventDefault(); if (index === 0) input.current?.focus(); else buttons.current[index - 1]?.focus(); }
    if (event.key === "Home") { event.preventDefault(); buttons.current[0]?.focus(); }
    if (event.key === "End") { event.preventDefault(); buttons.current[filtered.length - 1]?.focus(); }
  }
  return <Dialog open={open} onClose={close} title={t("common.commandPalette")}>
    <input ref={input} className="input" autoFocus value={query} onChange={event => setQuery(event.target.value)}
      placeholder={t("common.sectionPlaceholder")} aria-label={t("common.commandPalette")}
      onKeyDown={event => {
        if (event.key === "ArrowDown" && filtered.length) { event.preventDefault(); buttons.current[0]?.focus(); }
        if (event.key === "Enter" && filtered[0]) { event.preventDefault(); navigate(filtered[0]); }
      }} />
    <nav aria-label={t("common.commandPalette")}>
      <ul className="mt-3 max-h-80 overflow-auto">
        {filtered.map((item, index) => <li key={item.id}>
          <button ref={element => { buttons.current[index] = element; }} type="button"
            className="shell-command-result" onClick={() => navigate(item)} onKeyDown={event => resultKey(event, index)}>
            <span>{item.label}</span>{item.group && <span className="text-xs text-[var(--muted)]">{item.group}</span>}
          </button>
        </li>)}
        {filtered.length === 0 && <li className="px-3 py-4 text-sm text-[var(--muted)]" role="status">{t("common.noResults")}</li>}
      </ul>
    </nav>
    <p className="mt-3 text-xs text-[var(--muted)]">{t("common.commandHint")}</p>
  </Dialog>;
}
