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
          <h2 className="text-lg font-semibold">PJUD / monitoreo judicial</h2>
          <p className="mt-1 text-sm text-[var(--ink-soft)]/70">
            Valores efectivos del entorno (solo lectura). Cámbielos en{" "}
            <code>.env</code> del Host y reinicie. Credenciales y sync
            ClaveÚnica se gestionan en Mis Causas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/causas/mis-causas" className="btn btn-secondary text-sm">
            Mis Causas CU
          </Link>
          <Link href="/causas/monitoreo" className="btn btn-ghost text-sm">
            Monitoreo
          </Link>
        </div>
      </div>

      {pjud.honesty && (
        <p className="rounded-2xl border border-[var(--line)] bg-white/70 p-3 text-sm text-[var(--ink-soft)]/80">
          {pjud.honesty}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[var(--line)] p-4">
          <h3 className="font-semibold">Ingest / conectores</h3>
          <Row label="Partner API" value={yn(pjud.apiConfigured)} hint="PJUD_API_URL" />
          <Row
            label="Sidecar scrape"
            value={
              !pjud.sidecar?.configured
                ? "no config"
                : pjud.sidecar.reachable
                  ? pjud.sidecar.scrapeReady
                    ? "ready"
                    : "up"
                  : "down"
            }
            hint="PJUD_SCRAPER_URL"
          />
          <Row label="Scrape OJV" value={yn(Boolean(pjud.publicScrapeReady))} hint="PJUD_PUBLIC_SCRAPE" />
          <Row label="Ingest live" value={yn(Boolean(pjud.liveIngestConfigured))} />
          <Row label="Webhook" value={yn(Boolean(pjud.webhookConfigured))} hint="PJUD_WEBHOOK_SECRET" />
          <Row label="Demo PJUD" value={yn(Boolean(pjud.demoAllowed))} hint="PJUD_ALLOW_DEMO" />
          <Row label="Backup PDF" value={yn(Boolean(pjud.pdfBackupEnabled))} hint="PJUD_PDF_BACKUP" />
        </div>

        <div className="rounded-2xl border border-[var(--line)] p-4">
          <h3 className="font-semibold">CAPTCHA (BYOK)</h3>
          <Row
            label="Proveedor"
            value={pjud.captcha?.provider || (pjud.captchaConfigured ? "on" : "off")}
            hint="CAPTCHA_SOLVER_PROVIDER"
          />
          <Row
            label="API key"
            value={pjud.captcha?.keyPresent ? "configurada" : "no"}
            hint="CAPTCHA_SOLVER_API_KEY (valor oculto)"
          />
          <Row
            label="Free tier"
            value={yn(Boolean(pjud.captcha?.freeTier))}
          />
          <Row
            label="Fallback"
            value={pjud.captcha?.fallbacks?.join(" → ") || "—"}
            hint="CAPTCHA_SOLVER_FALLBACK"
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
          <Row label="Habilitada" value={yn(claveUnica.enabled)} />
          <Row label="RUT" value={claveUnica.rutMasked || "—"} />
          <Row label="Password vault" value={claveUnica.passwordSet ? "cifrada" : "no"} />
          <Row
            label="Automatización CU"
            value={yn(claveUnica.scrapeAllowed ?? claveUnica.scrapeEnvEnabled)}
            hint="Credenciales en Mis Causas; PJUD_CLAVEUNICA_SCRAPE=0 la bloquea"
          />
          <Row
            label="Último sync"
            value={
              claveUnica.lastSyncAt
                ? `${claveUnica.lastSyncStatus || "—"} · ${new Date(claveUnica.lastSyncAt).toLocaleString("es-CL")}`
                : "—"
            }
          />
          {claveUnica.lastSyncNote && (
            <p className="mt-2 text-xs text-[var(--ink-soft)]/70">{claveUnica.lastSyncNote}</p>
          )}
          <Link href={claveUnica.manageHref} className="btn btn-secondary mt-4 inline-flex text-sm">
            Editar ClaveÚnica
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
