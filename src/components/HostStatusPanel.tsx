import type { HostStatus } from "@/lib/host-status";

function yesNo(value: boolean) {
  return value ? "Sí" : "No";
}

function statusLabel(available: boolean) {
  return available ? "Disponible" : "No disponible";
}

export function HostStatusPanel({ status }: { status: HostStatus }) {
  const { app, storage, ocr, pjud, backups, queue, counts } = status;

  return (
    <section className="panel space-y-5 rounded-3xl p-5" data-testid="host-status-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Estado del Host</h2>
          <p className="mt-1 text-sm text-[var(--ink-soft)]/70">
            Diagnóstico operativo local, sin exponer secretos ni credenciales.
          </p>
        </div>
        <span className="badge badge-sea">Actualizado {new Date(status.generatedAt).toLocaleTimeString("es-CL")}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-[var(--line)] bg-white/70 p-4">
          <div className="text-xs uppercase tracking-[0.12em] text-[var(--ink-soft)]/55">
            Aplicación
          </div>
          <div className="mt-2 font-semibold">{app.version || "desconocida"}</div>
          <div className="mt-1 text-xs text-[var(--ink-soft)]/65">
            {app.environment} · Node {app.node}
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--line)] bg-white/70 p-4">
          <div className="text-xs uppercase tracking-[0.12em] text-[var(--ink-soft)]/55">
            Almacenamiento
          </div>
          <div className="mt-2 font-semibold">
            {storage.mode} · {storage.ready ? "listo" : "revisar"}
          </div>
          <div className="mt-1 text-xs text-[var(--ink-soft)]/65">
            Persistencia requerida: {yesNo(storage.required)}
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--line)] bg-white/70 p-4">
          <div className="text-xs uppercase tracking-[0.12em] text-[var(--ink-soft)]/55">
            OCR local
          </div>
          <div className="mt-2 font-semibold">{statusLabel(ocr.available)}</div>
          <div className="mt-1 text-xs text-[var(--ink-soft)]/65">
            {ocr.provider}
            {ocr.version ? ` · ${ocr.version}` : ""}
            {ocr.reason ? ` · ${ocr.reason}` : ""}
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--line)] bg-white/70 p-4">
          <div className="text-xs uppercase tracking-[0.12em] text-[var(--ink-soft)]/55">
            PJUD
          </div>
          <div className="mt-2 font-semibold">
            {pjud.liveIngestConfigured
              ? pjud.apiConfigured
                ? "Partner API"
                : pjud.scraperSidecarConfigured
                  ? "Scraper sidecar"
                  : pjud.publicScrapeReady
                    ? "Scrape OJV"
                    : "Ingest listo"
              : pjud.webhookConfigured
                ? "Webhook"
                : "Sin ingest live"}
          </div>
          <div className="mt-1 text-xs text-[var(--ink-soft)]/65">
            Demo {yesNo(pjud.demoAllowed)} · CU scrape{" "}
            {yesNo(Boolean(pjud.claveUnicaScrapeEnabled))} · CAPTCHA{" "}
            {yesNo(Boolean(pjud.captchaConfigured))}
            {" · "}
            Fallidos {pjud.failedJobs ?? 0}
            {pjud.queue
              ? ` · Cola ${pjud.queue.pending}p/${pjud.queue.running}r`
              : ""}
            {pjud.digest?.lastStatus
              ? ` · Digest ${pjud.digest.lastStatus}`
              : " · Digest —"}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[var(--line)] p-4">
          <h3 className="font-semibold">Procesamiento documental</h3>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-[var(--ink-soft)]/65">Documentos</dt>
            <dd className="text-right font-medium">{counts.documents}</dd>
            <dt className="text-[var(--ink-soft)]/65">Pendientes</dt>
            <dd className="text-right font-medium">{counts.pendingDocuments}</dd>
            <dt className="text-[var(--ink-soft)]/65">Con error</dt>
            <dd className="text-right font-medium">{counts.failedDocuments}</dd>
            <dt className="text-[var(--ink-soft)]/65">En cola / activos</dt>
            <dd className="text-right font-medium">
              {queue.queued} / {queue.active}
            </dd>
          </dl>
        </div>
        <div className="rounded-2xl border border-[var(--line)] p-4">
          <h3 className="font-semibold">Datos del estudio</h3>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-[var(--ink-soft)]/65">Usuarios</dt>
            <dd className="text-right font-medium">{counts.users}</dd>
            <dt className="text-[var(--ink-soft)]/65">Espacios</dt>
            <dd className="text-right font-medium">{counts.sites}</dd>
            <dt className="text-[var(--ink-soft)]/65">Causas activas</dt>
            <dd className="text-right font-medium">{counts.activeCauses}</dd>
            <dt className="text-[var(--ink-soft)]/65">Causas monitoreadas</dt>
            <dd className="text-right font-medium">{counts.monitoredCauses}</dd>
            <dt className="text-[var(--ink-soft)]/65">Jobs PJUD fallidos</dt>
            <dd className="text-right font-medium">
              {counts.failedPjudJobs ?? pjud.failedJobs ?? 0}
            </dd>
            <dt className="text-[var(--ink-soft)]/65">Facturas abiertas</dt>
            <dd className="text-right font-medium">{counts.openInvoices}</dd>
          </dl>
          {pjud.digest?.lastNote && (
            <p className="mt-3 text-xs text-[var(--ink-soft)]/70">
              Digest: {pjud.digest.lastNote}
              {pjud.digest.lastAt
                ? ` · ${new Date(pjud.digest.lastAt).toLocaleString("es-CL")}`
                : ""}
            </p>
          )}
          {pjud.queue && (
            <p className="mt-2 text-xs text-[var(--ink-soft)]/70">
              Cola PJUD: {pjud.queue.pending} pending · {pjud.queue.running}{" "}
              running · {pjud.queue.failed} failed · {pjud.queue.okToday} ok
              (24h)
            </p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--line)] bg-white/60 p-4 text-sm">
        <span className="font-semibold">Backups automáticos:</span>{" "}
        {backups.enabled
          ? `cada ${backups.intervalMinutes} min · retención ${backups.retention ?? "inválida"} · ${backups.status}`
          : "desactivados"}
        {backups.enabled && (
          <span className="ml-2 text-[var(--ink-soft)]/65">
            {backups.lastBackup
              ? `Último: ${backups.lastBackup.name} (${backups.lastBackup.ageMinutes} min)`
              : `Sin backup válido · directorio ${backups.directoryState}`}
          </span>
        )}
      </div>
    </section>
  );
}
