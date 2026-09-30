"use client";

import { cn } from "@/lib/chile";
import type { ReactNode } from "react";

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
  return (
    <div>
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-[var(--line)] pb-1">
        {items.map((item) => {
          const selected = item.id === value;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              className={cn(
                "rounded-t-lg px-3 py-2 text-sm font-medium transition-colors duration-[var(--motion-fast)]",
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
            id={`panel-${item.id}`}
            aria-labelledby={`tab-${item.id}`}
            className="pt-4"
          >
            {item.panel}
          </div>
        ) : null
      )}
    </div>
  );
}
