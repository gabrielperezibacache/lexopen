"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiMutation } from "@/lib/api-mutation";
import { useI18n } from "@/components/i18n/I18nProvider";
import { Button } from "@/components/ui";

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
  recoveryRequired?: boolean;
  backupDirectory?: string | null;
};

const ACTIVE = new Set([
  "queued",
  "preflight",
  "backing_up",
  "applying",
  "pulling",
  "installing",
  "migrating",
  "building",
  "restarting",
  "awaiting_restart",
]);

export function SelfUpdatePanel() {
  const { t } = useI18n();
  const readingStatus = useRef(false);
  const refreshPending = useRef(false);
  const currentReceipt = useRef<string | null>(null);
  const previousReceipt = useRef<string | null | undefined>(undefined);
  const [loadError, setLoadError] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async function readStatus(): Promise<void> {
    if (readingStatus.current) { refreshPending.current = true; return; }
    readingStatus.current = true;
    try {
      const res = await fetch("/api/admin/self-update", { cache: "no-store", signal: AbortSignal.timeout(12_000) });
      if (!res.ok) throw new Error("status unavailable");
      const payload = await res.json();
      if (refreshPending.current) return;
      currentReceipt.current = payload.requestId || null;
      setStatus(payload);
      setRecovering(false);
      if (ACTIVE.has(payload.phase) || payload.phase === "done" && payload.ok && payload.requestId !== previousReceipt.current) setMsg("");
      setLoadError("");
    } catch {
      setLoadError(t("updates.statusUnavailable"));
    } finally {
      readingStatus.current = false;
      if (refreshPending.current) {
        refreshPending.current = false;
        queueMicrotask(() => void readStatus());
      }
    }
  }, [t]);

  useEffect(() => {
    const starting = () => { previousReceipt.current = currentReceipt.current; setBusy(true); };
    const refresh = () => { setBusy(false); setRecovering(true); void load(); };
    window.addEventListener("lexopen:self-update:starting", starting);
    window.addEventListener("lexopen:self-update", refresh);
    return () => {
      window.removeEventListener("lexopen:self-update:starting", starting);
      window.removeEventListener("lexopen:self-update", refresh);
    };
  }, [load]);

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
    if (!recovering && status && !ACTIVE.has(status.phase)) return;
    const id = setInterval(() => void load(), 3000);
    return () => clearInterval(id);
  }, [status, recovering, load]);

  async function start() {
    setBusy(true);
    setMsg("");
    window.dispatchEvent(new Event("lexopen:self-update:starting"));
    const result = await apiMutation<{ status?: Status }>("/api/admin/self-update", {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    });
    window.dispatchEvent(new Event("lexopen:self-update"));
    if (!result.ok) {
      setMsg(result.error || t("updates.startFailed"));
      return;
    }
    setStatus(result.data.status || null);
    setMsg(
      result.data.status?.message ||
        t("updates.startedHint")
    );
  }

  if (!status) {
    return (
      <div className="rounded-2xl border border-[var(--line)] bg-white/60 p-4 text-sm text-[var(--ink-soft)]/70">
        {loadError ? <>
          <p role="alert">{loadError}</p>
          <Button variant="secondary" className="mt-3" onClick={() => void load()}>{t("common.retry")}</Button>
        </> : t("updates.loading")}
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
            {status.updateAvailable && status.latestVersion
              ? ` · disponible v${status.latestVersion}`
              : ""}
          </p>
          {!status.available && status.reason && (
            <p className="mt-2 text-xs text-[var(--ink-soft)]/70">{status.reason}</p>
          )}
          {loadError && <p className="mt-2 text-xs text-[var(--ink-soft)]/70" role="status">{loadError}</p>}
          {status.message && (
            <p className="mt-2 text-xs text-[var(--ink)]">{status.message}</p>
          )}
          {status.error && (
            <p className="mt-2 text-xs text-rose-800">{status.error}</p>
          )}
          {status.recoveryRequired && <p className="mt-2 text-sm text-rose-800" role="alert">El Host necesita una comprobación antes de otra actualización. Conserve el respaldo y consulte la guía de recuperación; no se revirtió la base automáticamente.</p>}
          {msg && <p className="mt-2 text-xs text-[var(--ink)]">{msg}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {status.available && (
            <Button
              disabled={busy || recovering || updating || status.recoveryRequired}
              onClick={start}
            >
              {recovering
                ? t("updates.phases.preflight")
                : updating
                ? t("updates.updatingTitle")
                : busy
                  ? t("updates.starting")
                  : status.updateAvailable
                    ? t("updates.start")
                    : t("updates.searchAndUpdate")}
            </Button>
          )}
          {status.phase === "done" && (
            <Button variant="secondary"
              onClick={() => window.location.reload()}
            >
              {t("updates.reload")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
