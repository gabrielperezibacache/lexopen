"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { ConfigSnapshot } from "@/lib/config-snapshot";

function Row({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--line)]/70 py-2 text-sm last:border-0">
      <div>
        <div className="font-medium text-[var(--ink)]">{label}</div>
        {hint && <div className="text-xs text-[var(--ink-soft)]/60">{hint}</div>}
      </div>
      <div className="text-right text-[var(--ink-soft)]/85">{value}</div>
    </div>
  );
}

function yn(v: boolean) {
  return v ? "Sí" : "No";
}

export function PjudSettingsPanel() {
  const [snap, setSnap] = useState<ConfigSnapshot | null>(null);

  useEffect(() => {
    fetch("/api/admin/config-snapshot")
      .then((r) => (r.ok ? r.json() : null))
      .then(setSnap)
      .catch(() => setSnap(null));
  }, []);

  if (!snap) {
    return (
      <div className="panel rounded-3xl p-5 text-sm text-[var(--ink-soft)]/70">
        Cargando PJUD…
      </div>
    );
  }

  const { pjud, claveUnica } = snap;

  return (
    <section
      id="pjud-settings"
      className="panel space-y-5 rounded-3xl p-5 md:p-6"
      data-testid="pjud-settings-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Seguimiento judicial (PJUD)</h2>
          <p className="mt-1 text-sm text-[var(--ink-soft)]/70">
            Vista técnica del servidor (solo lectura). Para guardar ClaveÚnica y
            sincronizar causas use Causas → ClaveÚnica. Los avisos del canal PJUD
            (servicio auxiliar, CAPTCHA) están en el log de esta sección.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/causas/mis-causas" className="btn btn-secondary text-sm">
            ClaveÚnica
          </Link>
          <Link href="/causas/monitoreo" className="btn btn-ghost text-sm">
            Cartera PJUD
          </Link>
        </div>
      </div>

      {pjud.opsLog?.length ? (
        <div
          id="pjud-log"
          className="rounded-2xl border border-[var(--line)] bg-[var(--ink)]/95 p-4 text-sm text-white/90"
          data-testid="pjud-ops-log"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-semibold text-white">Log PJUD</h3>
            <span className="text-[11px] uppercase tracking-[0.12em] text-white/45">
              {snap.generatedAt
                ? new Date(snap.generatedAt).toLocaleString("es-CL")
                : ""}
            </span>
          </div>
          <p className="mt-1 text-xs text-white/55">
            Avisos del Host (servicio auxiliar, CAPTCHA, canal). No se muestran
            en Causas para no ensuciar el expediente.
          </p>
          <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto font-mono text-[12px] leading-relaxed">
            {pjud.opsLog.map((entry, i) => (
              <li key={`${entry.source}-${entry.at}-${i}`} className="flex gap-2">
                <span
                  className={
                    entry.level === "error"
                      ? "shrink-0 text-rose-300"
                      : entry.level === "warn"
                        ? "shrink-0 text-amber-300"
                        : "shrink-0 text-emerald-300"
                  }
                >
                  {entry.level.toUpperCase()}
                </span>
                <span className="shrink-0 text-white/40">{entry.source}</span>
                <span className="min-w-0 break-words text-white/85">
                  {entry.message}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p
          id="pjud-log"
          className="rounded-2xl border border-[var(--line)] bg-white/70 p-3 text-sm text-[var(--ink-soft)]/70"
        >
          Log PJUD: sin avisos del Host en este momento.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[var(--line)] p-4">
          <h3 className="font-semibold">Cómo se consulta el PJUD</h3>
          <Row
            label="API de socio"
            value={yn(pjud.apiConfigured)}
            hint="Variable PJUD_API_URL en el Host"
          />
          <Row
            label="Servicio auxiliar"
            value={
              !pjud.sidecar?.configured
                ? "no usado"
                : pjud.sidecar.reachable
                  ? pjud.sidecar.scrapeReady
                    ? "listo"
                    : "encendido"
                  : "apagado"
            }
            hint="Variable PJUD_SCRAPER_URL en el Host"
          />
          <Row
            label="Consulta directa OJV"
            value={yn(Boolean(pjud.publicScrapeReady))}
            hint="Variable PJUD_PUBLIC_SCRAPE"
          />
          <Row
            label="Consulta en vivo"
            value={yn(Boolean(pjud.liveIngestConfigured))}
          />
          <Row
            label="Webhook"
            value={yn(Boolean(pjud.webhookConfigured))}
            hint="Variable PJUD_WEBHOOK_SECRET"
          />
          <Row
            label="Modo demo"
            value={yn(Boolean(pjud.demoAllowed))}
            hint="Variable PJUD_ALLOW_DEMO"
          />
          <Row
            label="Respaldo PDF"
            value={yn(Boolean(pjud.pdfBackupEnabled))}
            hint="Variable PJUD_PDF_BACKUP"
          />
        </div>

        <div className="rounded-2xl border border-[var(--line)] p-4">
          <h3 className="font-semibold">Resolutor de CAPTCHA</h3>
          <Row
            label="Proveedor"
            value={pjud.captcha?.provider || (pjud.captchaConfigured ? "activo" : "no")}
            hint="Variable CAPTCHA_SOLVER_PROVIDER"
          />
          <Row
            label="Clave API"
            value={pjud.captcha?.keyPresent ? "configurada" : "falta"}
            hint="Variable CAPTCHA_SOLVER_API_KEY (oculta)"
          />
          <Row
            label="Plan gratuito"
            value={yn(Boolean(pjud.captcha?.freeTier))}
          />
          <Row
            label="Respaldo"
            value={pjud.captcha?.fallbacks?.join(" → ") || "—"}
            hint="Variable CAPTCHA_SOLVER_FALLBACK"
          />
          {pjud.captcha?.configError && (
            <p className="mt-2 text-xs text-rose-700">{pjud.captcha.configError}</p>
          )}
          {pjud.captchaSnippet && (
            <pre className="mt-3 overflow-x-auto rounded-xl bg-[var(--ink)] p-3 text-[11px] text-white/85">
              {pjud.captchaSnippet}
            </pre>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--line)] p-4">
          <h3 className="font-semibold">Intervalos / cola</h3>
          <Row label="Sync causas (min)" value={pjud.intervals.syncMinutes} hint="PJUD_SYNC_INTERVAL_MINUTES" />
          <Row label="Mis Causas (min)" value={pjud.intervals.misCausasMinutes || "off"} hint="PJUD_MIS_CAUSAS_INTERVAL_MINUTES" />
          <Row label="Digest (min)" value={pjud.intervals.digestMinutes || "off"} hint="PJUD_DIGEST_INTERVAL_MINUTES" />
          <Row label="Concurrencia" value={pjud.intervals.concurrency} hint="PJUD_SYNC_CONCURRENCY" />
          <Row label="Budget solves/día" value={pjud.intervals.dailySolveBudget} hint="PJUD_CAUSAS_DAILY_SOLVE_BUDGET" />
          <Row
            label="Cola"
            value={
              pjud.queue
                ? `${pjud.queue.pending ?? pjud.queue.waiting}p / ${pjud.queue.running ?? pjud.queue.active}r / ${pjud.queue.failed}f`
                : "—"
            }
          />
          <Row label="Jobs fallidos" value={pjud.failedJobs ?? 0} />
        </div>

        <div className="rounded-2xl border border-[var(--line)] p-4">
          <h3 className="font-semibold">ClaveÚnica del estudio</h3>
          <Row label="Conexión activa" value={yn(claveUnica.enabled)} />
          <Row label="RUT guardado" value={claveUnica.rutMasked || "—"} />
          <Row
            label="Contraseña"
            value={claveUnica.passwordSet ? "guardada (cifrada)" : "no"}
          />
          <Row
            label="Consulta automática"
            value={yn(claveUnica.scrapeAllowed ?? claveUnica.scrapeEnvEnabled)}
            hint="Se gestiona en Mis Causas; el administrador del Host puede bloquearla"
          />
          <Row
            label="Última sincronización"
            value={
              claveUnica.lastSyncAt
                ? `${
                    claveUnica.lastSyncStatus === "ok"
                      ? "correcta"
                      : claveUnica.lastSyncStatus === "partial"
                        ? "parcial"
                        : claveUnica.lastSyncStatus === "failed"
                          ? "con errores"
                          : claveUnica.lastSyncStatus || "—"
                  } · ${new Date(claveUnica.lastSyncAt).toLocaleString("es-CL")}`
                : "—"
            }
          />
          {claveUnica.lastSyncNote && (
            <p className="mt-2 text-xs text-[var(--ink-soft)]/70">{claveUnica.lastSyncNote}</p>
          )}
          <Link href={claveUnica.manageHref} className="btn btn-secondary mt-4 inline-flex text-sm">
            Abrir ClaveÚnica
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--line)] bg-white/60 p-4 text-xs text-[var(--ink-soft)]/75">
        <p className="font-medium text-[var(--ink)]">Flags de entorno (presencia)</p>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(pjud.env).map(([k, v]) => (
            <li key={k}>
              <code>{k}</code>: {typeof v === "boolean" ? yn(v) : v || "—"}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
