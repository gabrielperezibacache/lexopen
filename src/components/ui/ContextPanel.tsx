"use client";
import { useCallback, useSyncExternalStore, type ReactNode } from "react";
import { Sheet } from "./Sheet";

/** One mounted content tree: resize/close never recreates editors or recorders. */
export function ContextPanel({ id, title, open, onClose, children, headerActions, className = "", compactBelow = 1120, forceOverlay = false }: {
  id: string; title: string; open: boolean; onClose: () => void; children: ReactNode;
  headerActions?: ReactNode; className?: string; compactBelow?: number; forceOverlay?: boolean;
}) {
  const query = `(min-width: ${compactBelow + 1}px)`;
  const subscribe = useCallback((changed: () => void) => { const media = matchMedia(query); media.addEventListener("change", changed); return () => media.removeEventListener("change", changed); }, [query]);
  const snapshot = useCallback(() => matchMedia(query).matches, [query]);
  const wide = useSyncExternalStore(subscribe, snapshot, () => true);
  return <Sheet id={id} title={title} open={open} onClose={onClose} headerActions={headerActions} className={`context-panel ${className}`} presentation={wide && !forceOverlay ? "inline" : "overlay"}>{children}</Sheet>;
}
