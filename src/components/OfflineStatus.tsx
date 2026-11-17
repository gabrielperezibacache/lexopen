"use client";
import { useSyncExternalStore } from "react";
function subscribe(change: () => void) { window.addEventListener("online", change); window.addEventListener("offline", change); return () => { window.removeEventListener("online", change); window.removeEventListener("offline", change); }; }
export function OfflineStatus() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  if(online)return null;
  return <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-2 text-sm text-[var(--ink-soft)]">
    <span role={online ? undefined : "status"} aria-live="polite">Sin conexión. Puedes continuar con las copias preparadas.</span>
    <a href="/offline.html" className="underline underline-offset-4">Abrir copias preparadas</a>
  </div>;
}
