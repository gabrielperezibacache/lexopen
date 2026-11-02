"use client";

import { cn } from "@/lib/chile";
import { useId, type ReactNode } from "react";

export type TabItem = { id: string; label: string; panel: ReactNode };

export function Tabs({
  items,
  value,
  onChange,
}: {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
}) {
  const groupId = useId();
  return (
    <div>
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-[var(--line)] pb-1" onKeyDown={(event) => {
        if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
        const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
        const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
        if (!items[next]) return;
        event.preventDefault(); onChange(items[next].id); tabs[next]?.focus();
      }}>
        {items.map((item) => {
          const selected = item.id === value;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`${groupId}-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`${groupId}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              className={cn(
                "min-h-[44px] rounded-t-lg px-3 py-2 text-sm font-medium transition-colors duration-[var(--motion-fast)]",
                selected
                  ? "bg-[var(--sea-soft)] text-[var(--sea)]"
                  : "text-[var(--muted)] hover:text-[var(--ink)]"
              )}
              onClick={() => onChange(item.id)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {items.map((item) =>
        item.id === value ? (
          <div
            key={item.id}
            role="tabpanel"
            id={`${groupId}-panel-${item.id}`}
            aria-labelledby={`${groupId}-tab-${item.id}`}
            className="pt-4"
          >
            {item.panel}
          </div>
        ) : null
      )}
    </div>
  );
}
