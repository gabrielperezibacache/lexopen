"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/chile";
import { useI18n } from "@/components/i18n/I18nProvider";

/**
 * Accessible modal dialog using the native `<dialog>` element.
 * No Radix dependency — justified: native dialog covers focus trap + Esc in modern browsers.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const { t } = useI18n();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={cn(
        "dialog-panel m-auto w-[min(32rem,calc(100vw-1.5rem))] max-h-[min(90vh,40rem)] overflow-auto p-0",
        className
      )}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
        <h2 id={titleId} className="text-lg font-semibold text-[var(--ink)]">
          {title}
        </h2>
        <button
          type="button"
          className="btn btn-ghost !min-h-0 !rounded-xl !px-2 !py-2"
          onClick={onClose}
          aria-label={t("common.close")}
        >
          <X size={16} />
        </button>
      </div>
      <div className="px-4 py-4">{children}</div>
    </dialog>
  );
}
