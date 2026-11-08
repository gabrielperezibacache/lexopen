"use client";
import { useSyncExternalStore } from "react";
function subscribe(change: () => void) { window.addEventListener("online", change); window.addEventListener("offline", change); return () => { window.removeEventListener("online", change); window.removeEventListener("offline", change); }; }
export function OfflineStatus() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  return <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-2 text-sm text-[var(--ink-soft)]">
    <span role={online ? undefined : "status"} aria-live="polite">{online ? "" : "Sin conexión. Puede continuar con las copias que haya preparado en este navegador."}</span>
    <a href="/offline.html" className="underline underline-offset-4">Trabajo sin conexión</a>
  </div>;
}
