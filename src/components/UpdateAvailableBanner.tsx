"use client";

import { useCallback, useEffect, useState } from "react";

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
  ok: boolean;
  available: boolean;
  reason?: string;
  message?: string | null;
  error?: string | null;
  toVersion?: string | null;
  webHostManaged?: boolean;
};

const DISMISS_PREFIX = "lexopen:dismiss-update:";

const ACTIVE_PHASES = new Set([
  "queued",
  "pulling",
  "installing",
  "migrating",
  "building",
  "restarting",
]);

function phaseLabel(phase: string) {
  switch (phase) {
    case "queued":
      return "En cola…";
    case "pulling":
      return "Descargando código…";
    case "installing":
      return "Instalando dependencias…";
    case "migrating":
      return "Aplicando base de datos…";
    case "building":
      return "Compilando…";
    case "restarting":
      return "Reiniciando Host…";
    case "done":
      return "Listo";
    case "failed":
      return "Falló";
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
  const [data, setData] = useState<UpdatePayload | null>(null);
  const [openSteps, setOpenSteps] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [selfUpdate, setSelfUpdate] = useState<SelfUpdateStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const refreshSelfUpdate = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/self-update");
      if (!res.ok) return null;
      const payload = (await res.json()) as SelfUpdateStatus;
      setSelfUpdate(payload);
      return payload;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    fetch("/api/admin/update-check")
      .then((res) => (res.ok ? res.json() : null))
      .then(async (payload: UpdatePayload | null) => {
        if (!active) return;
        if (canSelfUpdate) await refreshSelfUpdate();
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
    if (!selfUpdate || !ACTIVE_PHASES.has(selfUpdate.phase)) return;
    const id = setInterval(() => {
      void refreshSelfUpdate().then((st) => {
        if (st?.phase === "done") {
          setMsg(
            st.message ||
              "Actualización aplicada. Recargue la página para ver la versión nueva."
          );
        }
        if (st?.phase === "failed") {
          setMsg(st.error || st.message || "La actualización falló.");
        }
      });
    }, 3000);
    return () => clearInterval(id);
  }, [enabled, canSelfUpdate, selfUpdate, refreshSelfUpdate]);

  const updating = Boolean(selfUpdate && ACTIVE_PHASES.has(selfUpdate.phase));
  const showBanner =
    enabled &&
    ((data?.updateAvailable && data.latestVersion && !dismissed) || updating);

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
    const res = await fetch("/api/admin/self-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    });
    const payload = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(payload.error || "No se pudo iniciar la actualización.");
      return;
    }
    setSelfUpdate(payload.status || null);
    setMsg(
      payload.status?.message ||
        "Actualización iniciada. La app estará unos minutos fuera de línea."
    );
  }

  const canAutoUpdate = canSelfUpdate && selfUpdate?.available !== false;
  const latest = data?.latestVersion || selfUpdate?.toVersion;

  return (
    <div
      className="border-b border-[var(--copper)]/30 bg-[rgba(176,122,74,0.12)] px-4 py-3 md:px-8"
      role="status"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--ink)]">
            {updating
              ? `Actualizando LexOpen… ${phaseLabel(selfUpdate!.phase)}`
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
              ? selfUpdate?.message ||
                "No cierre el navegador. Cuando termine, recargue la página."
              : "Puede actualizar desde aquí sin salir de LexOpen. Los datos del estudio se conservan."}
          </p>
          {msg && (
            <p className="mt-2 text-xs text-[var(--ink)]" role="status">
              {msg}
            </p>
          )}
          {selfUpdate?.phase === "failed" && selfUpdate.error && (
            <p className="mt-2 text-xs text-rose-800">{selfUpdate.error}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {canAutoUpdate && !updating && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={startUpdate}
            >
              {busy ? "Iniciando…" : "Actualizar ahora"}
            </button>
          )}
          {selfUpdate?.phase === "done" && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => window.location.reload()}
            >
              Recargar aplicación
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setOpenSteps((v) => !v)}
          >
            {openSteps ? "Ocultar pasos" : "Pasos manuales"}
          </button>
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
            <button type="button" className="btn btn-ghost" onClick={dismiss}>
              Descartar
            </button>
          )}
        </div>
      </div>

      {!canAutoUpdate && selfUpdate?.reason && (
        <p className="mt-3 text-xs text-[var(--ink-soft)]/80">{selfUpdate.reason}</p>
      )}

      {openSteps && (
        <div className="mt-3 rounded-2xl border border-[var(--line)] bg-white/80 p-4 text-sm text-[var(--ink-soft)]/90">
          <p className="font-medium text-[var(--ink)]">
            Actualización manual (si el botón no está disponible)
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>
              Respalde con el Host detenido:{" "}
              <code className="text-xs">
                npm run web:backup -- --output /ruta/backup
              </code>
              {data?.desktop ? " (o menú LexOpen → Crear respaldo…)" : ""}
            </li>
            <li>
              En el clon del Host:{" "}
              <code className="text-xs">git pull origin main && npm ci</code>
            </li>
            <li>
              Arranque de nuevo:{" "}
              <code className="text-xs">
                {data?.desktop
                  ? "npm run desktop:dev"
                  : "LEXOPEN_DATA_DIR=… npm run web:host"}
              </code>
              .
            </li>
            <li>Recargue el navegador (F5).</li>
          </ol>
        </div>
      )}
    </div>
  );
}
