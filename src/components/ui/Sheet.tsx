"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/chile";
import { useI18n } from "@/components/i18n/I18nProvider";

/**
 * Side drawer (Sheet). Native focus management + Escape; no Vaul/Radix.
 * Prefer for notification center / filters on mobile.
 */
export function Sheet({
  open,
  onClose,
  title,
  side = "right",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  side?: "left" | "right";
  children: ReactNode;
}) {
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <div
      className={cn(
        "fixed inset-0 z-50",
        open ? "pointer-events-auto" : "pointer-events-none"
      )}
      aria-hidden={!open}
    >
      <button
        type="button"
        className={cn(
          "dialog-backdrop absolute inset-0 transition-opacity duration-[var(--motion-base)]",
          open ? "opacity-100" : "opacity-0"
        )}
        aria-label={t("common.close")}
        tabIndex={open ? 0 : -1}
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "absolute top-0 flex h-full w-[min(22rem,92vw)] flex-col bg-[var(--surface-solid)] shadow-[var(--shadow)] transition-transform duration-[var(--motion-base)] ease-out",
          side === "right" ? "right-0" : "left-0",
          open
            ? "translate-x-0"
            : side === "right"
              ? "translate-x-full"
              : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
          <h2 className="font-semibold text-[var(--ink)]">{title}</h2>
          <button
            type="button"
            className="btn btn-ghost !min-h-0 !rounded-xl !px-2 !py-2"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </aside>
    </div>
  );
}
