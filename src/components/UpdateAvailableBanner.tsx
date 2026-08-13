"use client";

import { useEffect, useState } from "react";

type UpdatePayload = {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string | null;
  releaseUrl: string | null;
  desktop: boolean;
  disabled: boolean;
};

const DISMISS_PREFIX = "lexopen:dismiss-update:";

export function UpdateAvailableBanner({ enabled }: { enabled: boolean }) {
  const [data, setData] = useState<UpdatePayload | null>(null);
  const [openSteps, setOpenSteps] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    fetch("/api/admin/update-check")
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: UpdatePayload | null) => {
        if (!active || !payload?.updateAvailable || !payload.latestVersion) return;
        try {
          if (localStorage.getItem(`${DISMISS_PREFIX}${payload.latestVersion}`) === "1") {
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
  }, [enabled]);

  if (!enabled || !data?.updateAvailable || !data.latestVersion || dismissed) {
    return null;
  }

  function dismiss() {
    try {
      localStorage.setItem(`${DISMISS_PREFIX}${data!.latestVersion}`, "1");
    } catch {
      // ignore
    }
    setDismissed(true);
  }

  return (
    <div
      className="border-b border-[var(--copper)]/30 bg-[rgba(176,122,74,0.12)] px-4 py-3 md:px-8"
      role="status"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--ink)]">
            Hay una versión nueva de LexOpen:{" "}
            <span className="text-[var(--copper)]">v{data.latestVersion}</span>
            <span className="font-normal text-[var(--ink-soft)]/80">
              {" "}
              (usted tiene v{data.currentVersion})
            </span>
          </p>
          <p className="mt-1 text-xs text-[var(--ink-soft)]/80">
            Actualice el Host para recibir correcciones y mejoras. Los datos del
            estudio se conservan.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setOpenSteps((v) => !v)}
          >
            {openSteps ? "Ocultar pasos" : "Cómo actualizar"}
          </button>
          {data.releaseUrl && (
            <a
              href={data.releaseUrl}
              target="_blank"
              rel="noreferrer"
              className="btn btn-ghost"
            >
              Ver release
            </a>
          )}
          <button type="button" className="btn btn-ghost" onClick={dismiss}>
            Descartar
          </button>
        </div>
      </div>

      {openSteps && (
        <div className="mt-3 rounded-2xl border border-[var(--line)] bg-white/80 p-4 text-sm text-[var(--ink-soft)]/90">
          <p className="font-medium text-[var(--ink)]">Host (clon del repositorio)</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>
              Respalde con el Host detenido:{" "}
              <code className="text-xs">npm run web:backup -- --output /ruta/backup</code>
              {data.desktop ? " (o menú LexOpen → Crear respaldo…)" : ""}
            </li>
            <li>
              En el clon del Host:{" "}
              <code className="text-xs">git pull origin main && npm ci</code>
            </li>
            <li>
              Arranque de nuevo:{" "}
              <code className="text-xs">
                {data.desktop
                  ? "npm run desktop:dev"
                  : "LEXOPEN_DATA_DIR=… npm run web:host"}
              </code>{" "}
              (o reinicie el servicio systemd/launchd).
            </li>
            <li>
              Verifique{" "}
              <code className="text-xs">curl http://127.0.0.1:3000/api/health</code>{" "}
              y refresque el navegador (F5).
            </li>
          </ol>
          <p className="mt-3 text-xs">
            Guía completa en el README:{" "}
            <a
              href="https://github.com/gabrielperezibacache/lexopen/blob/main/README.md#-c%C3%B3mo-actualizar-la-aplicaci%C3%B3n"
              target="_blank"
              rel="noreferrer"
              className="text-[var(--sea)] underline"
            >
              Cómo actualizar la aplicación
            </a>
            .
          </p>
        </div>
      )}
    </div>
  );
}
