"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiMutation } from "@/lib/api-mutation";
import { useI18n } from "@/components/i18n/I18nProvider";
import { Button } from "@/components/ui";

type UpdatePayload = {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string | null;
  releaseUrl: string | null;
  desktop: boolean;
  disabled: boolean;
};

type SelfUpdateStatus = {
  phase: string;
  currentVersion: string;
  requestId?: string | null;
  ok: boolean;
  available: boolean;
  reason?: string;
  message?: string | null;
  error?: string | null;
  toVersion?: string | null;
  webHostManaged?: boolean;
  recoveryRequired?: boolean;
};

const DISMISS_PREFIX = "lexopen:dismiss-update:";

const ACTIVE_PHASES = new Set([
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

function phaseLabel(phase: string, t: (key: string) => string) {
  switch (phase) {
    case "queued":
      return t("updates.phases.queued");
    case "preflight":
      return t("updates.phases.preflight");
    case "backing_up":
      return t("updates.phases.backingUp");
    case "applying":
      return t("updates.phases.applying");
    case "pulling":
      return t("updates.phases.pulling");
    case "installing":
      return t("updates.phases.installing");
    case "migrating":
      return t("updates.phases.migrating");
    case "building":
      return t("updates.phases.building");
    case "restarting":
    case "awaiting_restart":
      return t("updates.phases.restarting");
    case "done":
      return t("updates.phases.done");
    case "failed":
      return t("updates.phases.failed");
    default:
      return phase;
  }
}

export function UpdateAvailableBanner({
  enabled,
  canSelfUpdate = false,
}: {
  enabled: boolean;
  canSelfUpdate?: boolean;
}) {
  const { t } = useI18n();
  const readingStatus = useRef(false);
  const refreshPending = useRef(false);
  const currentReceipt = useRef<string | null>(null);
  const previousReceipt = useRef<string | null | undefined>(undefined);
  const [tracking, setTracking] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [data, setData] = useState<UpdatePayload | null>(null);
  const [openSteps, setOpenSteps] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [selfUpdate, setSelfUpdate] = useState<SelfUpdateStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const refreshSelfUpdate = useCallback(async function readStatus(): Promise<SelfUpdateStatus | null> {
    if (readingStatus.current) { refreshPending.current = true; return null; }
    readingStatus.current = true;
    try {
      const res = await fetch("/api/admin/self-update", { cache: "no-store", signal: AbortSignal.timeout(12_000) });
      if (!res.ok) return null;
      const payload = (await res.json()) as SelfUpdateStatus;
      // A request begun before the local mutation finished may still describe
      // the old idle state. The coalesced refresh below obtains a fresh receipt.
      if (refreshPending.current) return null;
      currentReceipt.current = payload.requestId || null;
      setSelfUpdate(payload);
      setRecovering(false);
      if (ACTIVE_PHASES.has(payload.phase)) { setTracking(true); setMsg(""); }
      else if (payload.phase === "done" && payload.requestId && payload.requestId === previousReceipt.current) setTracking(false);
      if (payload.phase === "done" && payload.ok && payload.requestId !== previousReceipt.current) setMsg("");
      return payload;
    } catch {
      return null;
    } finally {
      readingStatus.current = false;
      if (refreshPending.current) {
        refreshPending.current = false;
        queueMicrotask(() => void readStatus());
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled || !canSelfUpdate) return;
    const starting = () => {
      previousReceipt.current = currentReceipt.current;
      setBusy(true);
      setTracking(true);
    };
    const refresh = () => {
      setBusy(false);
      setRecovering(true);
      void refreshSelfUpdate();
    };
    window.addEventListener("lexopen:self-update:starting", starting);
    window.addEventListener("lexopen:self-update", refresh);
    return () => {
      window.removeEventListener("lexopen:self-update:starting", starting);
      window.removeEventListener("lexopen:self-update", refresh);
    };
  }, [enabled, canSelfUpdate, refreshSelfUpdate]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    if (canSelfUpdate) queueMicrotask(() => { if (active) void refreshSelfUpdate(); });
    fetch("/api/admin/update-check", { signal: AbortSignal.timeout(12_000) })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: UpdatePayload | null) => {
        if (!active) return;
        if (!payload?.updateAvailable || !payload.latestVersion) return;
        try {
          if (
            localStorage.getItem(`${DISMISS_PREFIX}${payload.latestVersion}`) ===
            "1"
          ) {
            setDismissed(true);
            return;
          }
        } catch {
          // ignore storage errors
        }
        setData(payload);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [enabled, canSelfUpdate, refreshSelfUpdate]);

  useEffect(() => {
    if (!enabled || !canSelfUpdate) return;
    if (!recovering && selfUpdate && !ACTIVE_PHASES.has(selfUpdate.phase)) return;
    const id = setInterval(() => {
      void refreshSelfUpdate().then((st) => {
        if (st?.phase === "done") {
          setMsg(
            st.message ||
              t("updates.completedHint")
          );
        }
        if (st?.phase === "failed") {
          setMsg(st.error || st.message || t("updates.failedTitle"));
        }
      });
    }, 3000);
    return () => clearInterval(id);
  }, [enabled, canSelfUpdate, selfUpdate, recovering, refreshSelfUpdate, t]);

  const updating = recovering || Boolean(selfUpdate && ACTIVE_PHASES.has(selfUpdate.phase));
  // A completed receipt belongs to an earlier operation. A fresh release check
  // for the currently running version must still offer the next update.
  const newUpdateAfterReceipt = selfUpdate?.phase === "done" && Boolean(
    data?.updateAvailable && data.currentVersion === selfUpdate.currentVersion
  );
  const finished = selfUpdate?.phase === "failed" || (selfUpdate?.phase === "done" && tracking && !newUpdateAfterReceipt);
  const showBanner =
    enabled &&
    ((data?.updateAvailable && data.latestVersion && !dismissed) || updating || (finished && !dismissed));

  if (!showBanner) {
    return null;
  }

  function dismiss() {
    if (data?.latestVersion) {
      try {
        localStorage.setItem(`${DISMISS_PREFIX}${data.latestVersion}`, "1");
      } catch {
        // ignore
      }
    }
    setDismissed(true);
  }

  async function startUpdate() {
    setBusy(true);
    setMsg("");
    window.dispatchEvent(new Event("lexopen:self-update:starting"));
    const result = await apiMutation<{ status?: SelfUpdateStatus }>(
      "/api/admin/self-update",
      {
        method: "POST",
        signal: AbortSignal.timeout(20_000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      }
    );
    // Even an error/aborted response may have queued the update already. Read
    // its receipt and keep retrying while the Host returns; never repeat POST.
    window.dispatchEvent(new Event("lexopen:self-update"));
    if (!result.ok) {
      setMsg(result.error || t("updates.startFailed"));
      return;
    }
    setSelfUpdate(result.data.status || null);
    setTracking(Boolean(result.data.status && ACTIVE_PHASES.has(result.data.status.phase)));
    setMsg(
      result.data.status?.message ||
        t("updates.startedHint")
    );
  }

  const canAutoUpdate = canSelfUpdate && selfUpdate?.available === true && !selfUpdate.recoveryRequired && (selfUpdate.phase !== "done" || newUpdateAfterReceipt);
  const latest = data?.latestVersion || selfUpdate?.toVersion;

  return (
    <div
      className="border-b border-[var(--line)] bg-[var(--sea-soft)] px-4 py-3 md:px-8"
      role="status"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--ink)]">
            {updating
              ? recovering ? t("updates.phases.preflight") : `${t("updates.updatingTitle")} ${phaseLabel(selfUpdate?.phase || "preflight", t)}`
              : finished
                ? selfUpdate?.phase === "done" ? t("updates.completedTitle") : t("updates.failedTitle")
              : (
                  <>
                    Hay una versión nueva de LexOpen:{" "}
                    <span className="text-[var(--copper)]">v{latest}</span>
                    {data?.currentVersion ? (
                      <span className="font-normal text-[var(--ink-soft)]/80">
                        {" "}
                        (usted tiene v{data.currentVersion})
                      </span>
                    ) : null}
                  </>
                )}
          </p>
          <p className="mt-1 text-xs text-[var(--ink-soft)]/80">
            {updating
              ? !recovering && selfUpdate?.message ||
                t("updates.updatingHint")
              : finished
                ? selfUpdate?.message || (selfUpdate?.phase === "done" ? t("updates.completedHint") : t("updates.failedHint"))
                : canAutoUpdate ? t("updates.availableHint") : t("updates.manualHint")}
          </p>
          {msg && (
            <p className="mt-2 text-xs text-[var(--ink)]" role="status">
              {msg}
            </p>
          )}
          {selfUpdate?.phase === "failed" && selfUpdate.error && (
            <p className="mt-2 text-xs text-rose-800">{selfUpdate.error}</p>
          )}
          {selfUpdate?.recoveryRequired && (
            <p className="mt-2 text-xs text-rose-800" role="alert">{t("updates.recoveryHint")}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {canAutoUpdate && !updating && (
            <Button
              disabled={busy}
              onClick={startUpdate}
            >
              {busy ? t("updates.starting") : t("updates.start")}
            </Button>
          )}
          {finished && selfUpdate?.phase === "done" && (
            <Button
              onClick={() => window.location.reload()}
            >
              {t("updates.reload")}
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => setOpenSteps((v) => !v)}
            aria-expanded={openSteps}
            aria-controls="manual-update-steps"
          >
            {openSteps ? t("updates.hideManual") : t("updates.showManual")}
          </Button>
          {data?.releaseUrl && (
            <a
              href={data.releaseUrl}
              target="_blank"
              rel="noreferrer"
              className="btn btn-ghost"
            >
              Ver release
            </a>
          )}
          {!updating && (
            <Button variant="ghost" onClick={dismiss}>
              {t("updates.dismiss")}
            </Button>
          )}
        </div>
      </div>

      {!canAutoUpdate && selfUpdate?.reason && (
        <p className="mt-3 text-xs text-[var(--ink-soft)]/80">{selfUpdate.reason}</p>
      )}

      {openSteps && (
        <div id="manual-update-steps" className="mt-3 rounded-2xl border border-[var(--line)] bg-white/80 p-4 text-sm text-[var(--ink-soft)]/90">
          <p className="font-medium text-[var(--ink)]">{t("updates.manualTitle")}</p>
          <p className="mt-2">{t("updates.manualGuideHint")}</p>
          <a className="btn btn-secondary mt-3" href="https://github.com/gabrielperezibacache/lexopen/blob/main/docs/ACTUALIZACIONES.md" target="_blank" rel="noreferrer">{t("updates.manualGuide")}</a>
        </div>
      )}
    </div>
  );
}
