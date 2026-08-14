"use client";

import { useCallback, useEffect, useState } from "react";

type Status = {
  phase: string;
  available: boolean;
  reason?: string;
  message?: string | null;
  error?: string | null;
  currentVersion: string;
  toVersion?: string | null;
  updateAvailable?: boolean;
  latestVersion?: string | null;
};

const ACTIVE = new Set([
  "queued",
  "pulling",
  "installing",
  "migrating",
  "building",
  "restarting",
]);

export function SelfUpdatePanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/self-update");
    if (!res.ok) return;
    setStatus(await res.json());
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      void load();
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    if (!status || !ACTIVE.has(status.phase)) return;
    const id = setInterval(() => void load(), 3000);
    return () => clearInterval(id);
  }, [status, load]);

  async function start() {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/admin/self-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error || "No se pudo iniciar la actualización.");
      return;
    }
    setStatus(data.status || null);
    setMsg(
      data.status?.message ||
        "Actualización iniciada. Espere a que el Host vuelva y recargue."
    );
  }

  if (!status) {
    return (
      <div className="rounded-2xl border border-[var(--line)] bg-white/60 p-4 text-sm text-[var(--ink-soft)]/70">
        Cargando opciones de actualización…
      </div>
    );
  }

  const updating = ACTIVE.has(status.phase);

  return (
    <div
      className="rounded-2xl border border-[var(--line)] bg-white/60 p-4"
      data-testid="self-update-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Actualización del Host</h3>
          <p className="mt-1 text-sm text-[var(--ink-soft)]/75">
            Actualice LexOpen desde esta pantalla cuando el Host lo permita (git +
            web-host). Versión actual: v{status.currentVersion}
            {status.latestVersion
              ? ` · disponible v${status.latestVersion}`
              : ""}
          </p>
          {!status.available && status.reason && (
            <p className="mt-2 text-xs text-[var(--ink-soft)]/70">{status.reason}</p>
          )}
          {status.message && (
            <p className="mt-2 text-xs text-[var(--ink)]">{status.message}</p>
          )}
          {status.error && (
            <p className="mt-2 text-xs text-rose-800">{status.error}</p>
          )}
          {msg && <p className="mt-2 text-xs text-[var(--ink)]">{msg}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {status.available && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || updating}
              onClick={start}
            >
              {updating
                ? "Actualizando…"
                : busy
                  ? "Iniciando…"
                  : status.updateAvailable
                    ? "Actualizar ahora"
                    : "Buscar y actualizar"}
            </button>
          )}
          {status.phase === "done" && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => window.location.reload()}
            >
              Recargar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
