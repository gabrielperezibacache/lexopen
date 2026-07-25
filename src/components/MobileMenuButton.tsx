"use client";

import { Menu } from "lucide-react";

export function MobileMenuButton() {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] px-3 py-2 text-sm text-[var(--ink-soft)]"
      onClick={() => window.dispatchEvent(new Event("lexopen:open-menu"))}
    >
      <Menu size={16} />
      Menú
    </button>
  );
}
