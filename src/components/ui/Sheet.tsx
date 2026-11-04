"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/chile";
import { useI18n } from "@/components/i18n/I18nProvider";
import "./Sheet.css";

let scrollLocks = 0, previousOverflow = "";
function lockScroll() {
  if (scrollLocks++ === 0) { previousOverflow = document.body.style.overflow; document.body.style.overflow = "hidden"; }
  return () => { if (--scrollLocks === 0) document.body.style.overflow = previousOverflow; };
}

/** The same mounted dialog becomes a non-modal panel or a native modal drawer. */
export function Sheet({ open, onClose, title, side = "right", children, id, className, headerActions, presentation = "overlay" }: {
  open: boolean; onClose: () => void; title: string; side?: "left" | "right"; children: ReactNode;
  id?: string; className?: string; headerActions?: ReactNode; presentation?: "overlay" | "inline";
}) {
  const { t } = useI18n(), titleId = useId(), dialog = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose), isOpen = useRef(open), returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => { close.current = onClose; isOpen.current = open; }, [onClose, open]);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const focus = document.activeElement;
    if (open && focus instanceof HTMLElement && !element.contains(focus)) returnFocus.current = focus;
    if (!open) {
      if (element.open) element.close();
      if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true });
      return;
    }
    if (presentation === "overlay") {
      if (element.open && !element.matches(":modal")) element.close();
      if (!element.open) element.showModal();
      return lockScroll();
    }
    if (element.matches(":modal")) element.close();
    // Setting open directly keeps an inline panel from stealing keyboard focus.
    element.open = true;
  }, [open, presentation]);
  return <dialog
    ref={dialog} id={id} className={cn("lexopen-sheet", className)} data-presentation={presentation} data-side={side}
    aria-labelledby={titleId} aria-modal={open && presentation === "overlay" ? true : undefined} inert={!open}
    onCancel={event => { event.preventDefault(); close.current(); }}
    onClose={() => { if (isOpen.current && !dialog.current?.open) close.current(); }}
    onKeyDown={event => { if (event.key === "Escape" && presentation === "inline") { event.preventDefault(); event.stopPropagation(); close.current(); } }}
    onClick={event => {
      if (presentation !== "overlay" || event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close.current();
    }}
  >
    <header className="lexopen-sheet-heading"><h2 id={titleId}>{title}</h2><button type="button" className="btn btn-ghost lexopen-sheet-close" onClick={() => close.current()} aria-label={t("common.close")}><X size={19} aria-hidden="true" /></button>{headerActions && <div className="lexopen-sheet-header-actions">{headerActions}</div>}</header>
    <div className="lexopen-sheet-content">{children}</div>
  </dialog>;
}
