"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { ConfigSnapshot } from "@/lib/config-snapshot";
import { useI18n } from "@/components/i18n/I18nProvider";

function Row({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  warn?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--line)]/70 py-2 text-sm last:border-0">
      <div>
        <div className={`font-medium ${warn ? "text-rose-800" : "text-[var(--ink)]"}`}>
          {label}
        </div>
        {hint && <div className="text-xs text-[var(--ink-soft)]/60">{hint}</div>}
      </div>
      <div className={`text-right ${warn ? "text-rose-800" : "text-[var(--ink-soft)]/85"}`}>
        {value}
      </div>
    </div>
  );
}

function yn(v: boolean) {
  return v ? "Sí" : "No";
}

export function RuntimeSettingsPanel() {
  const { t } = useI18n();
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
        {t("integrations.loadingEnv")}
      </div>
    );
  }

  const { app, storage, ocr, backups, security, llm } = snap;

  return (
    <section
      id="runtime-settings"
      className="panel space-y-5 rounded-3xl p-5 md:p-6"
      data-testid="runtime-settings-panel"
    >
      <div>
        <h2 className="text-lg font-semibold">Entorno y operación</h2>
        <p className="mt-1 text-sm text-[var(--ink-soft)]/70">
          Parámetros del proceso y del host. No se editan aquí: modifíquelos en
          variables de entorno (o Blueprint) y reinicie el servicio. Los secretos
          solo muestran si están definidos.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[var(--line)] p-4">
          <h3 className="font-semibold">Aplicación</h3>
          <Row label="Nombre público" value={app.displayName} hint="NEXT_PUBLIC_APP_NAME" />
          <Row label="URL canónica" value={app.publicUrl || "(Host de la petición)"} hint="NEXT_PUBLIC_APP_URL" />
          <Row label="Puerto" value={app.port} hint="PORT" />
          <Row label="Versión" value={app.version || "—"} />
          <Row label="Entorno" value={app.environment} />
          <Row label="Desktop Host" value={yn(app.desktop)} hint="LEXOPEN_DESKTOP" />
          <Row
            label="Data dir"
            value={app.dataDirectoryConfigured ? "configurado" : "no"}
            hint="LEXOPEN_DATA_DIR"
          />
        </div>

        <div className="rounded-2xl border border-[var(--line)] p-4">
          <h3 className="font-semibold">Seguridad</h3>
          <Row
            label="Demo switcher"
            value={yn(security.demoSwitcher)}
            hint="LEXOPEN_DEMO_SWITCHER"
            warn={security.demoSwitcher && app.environment === "production"}
          />
          <Row
            label="Open access"
            value={yn(security.openAccess)}
            hint="LEXOPEN_OPEN_ACCESS (peligroso)"
            warn={security.openAccess}
          />
          <Row
            label="Bootstrap token"
            value={security.bootstrapTokenSet ? "definido" : "no"}
            hint="LEXOPEN_BOOTSTRAP_TOKEN"
          />
          <Row label="SESSION_SECRET" value={security.sessionSecretSet ? "definido" : "faltante"} warn={!security.sessionSecretSet} />
          <Row label="Trusted proxy" value={yn(security.trustedProxy)} hint="LEXOPEN_TRUSTED_PROXY" />
          <Row
            label="Trusted origins"
            value={security.trustedOrigins || "—"}
            hint="LEXOPEN_TRUSTED_ORIGINS"
          />
          <Row
            label="Relax CSRF"
            value={yn(security.relaxCsrf)}
            hint="LEXOPEN_RELAX_CSRF"
            warn={security.relaxCsrf}
          />
          <Row
            label="Passwords plaintext"
            value={yn(security.allowPlaintextPasswords)}
            hint="LEXOPEN_ALLOW_PLAINTEXT_PASSWORDS"
            warn={security.allowPlaintextPasswords}
          />
        </div>

        <div className="rounded-2xl border border-[var(--line)] p-4">
          <h3 className="font-semibold">Almacenamiento</h3>
          <Row label="Modo" value={`${storage.mode} · ${storage.ready ? "listo" : "revisar"}`} />
          <Row label="Persistencia requerida" value={yn(storage.required)} hint="LEXOPEN_REQUIRE_PERSISTENT_STORAGE" />
          <Row label="STORAGE_PATH" value={storage.storagePathSet ? "definido" : "no"} />
          <Row
            label="Local prod storage"
            value={yn(storage.allowLocalProduction)}
            hint="LEXOPEN_ALLOW_LOCAL_PRODUCTION_STORAGE"
          />
          <Row label="S3 bucket" value={storage.s3.bucket || "—"} hint="S3_BUCKET" />
          <Row label="S3 region" value={storage.s3.region || "—"} />
          <Row label="S3 endpoint" value={storage.s3.endpointSet ? "definido" : "no"} />
          <Row
            label="S3 keys"
            value={
              storage.s3.accessKeySet && storage.s3.secretKeySet
                ? "definidas"
                : "incompletas / no"
            }
          />
        </div>

        <div className="rounded-2xl border border-[var(--line)] p-4">
          <h3 className="font-semibold">OCR / documentos</h3>
          <Row label="Disponible" value={ocr.available ? "Sí" : "No"} />
          <Row label="Proveedor" value={ocr.provider || "—"} />
          <Row label="Habilitado" value={yn(ocr.settings.enabled)} hint="OCR_ENABLED" />
          <Row label="Idioma" value={ocr.settings.language} hint="OCR_LANGUAGE" />
          <Row label="Máx. páginas" value={ocr.settings.maxPages} hint="OCR_MAX_PAGES" />
          <Row label="Timeout (ms)" value={ocr.settings.timeoutMs} hint="OCR_TIMEOUT_MS" />
          <Row label="tesseract" value={ocr.settings.tesseractBin} hint="OCR_TESSERACT_BIN" />
          <Row label="pdftoppm" value={ocr.settings.pdftoppmBin} hint="OCR_PDFTOPPM_BIN" />
          {ocr.reason && (
            <p className="mt-2 text-xs text-[var(--ink-soft)]/70">{ocr.reason}</p>
          )}
          {ocr.hint && (
            <p className="mt-2 text-xs text-[var(--ink-soft)]/80">{ocr.hint}</p>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--line)] p-4">
          <h3 className="font-semibold">Backups automáticos</h3>
          <Row
            label="Intervalo (min)"
            value={backups.intervalMinutes || "off"}
            hint="LEXOPEN_BACKUP_INTERVAL_MINUTES"
          />
          <Row label="Retención" value={backups.keep ?? backups.retention ?? "—"} hint="LEXOPEN_BACKUP_KEEP" />
          <Row label="Directorio" value={backups.dirSet ? "definido" : "no"} hint="LEXOPEN_BACKUP_DIR" />
          <Row label="Estado" value={backups.enabled ? backups.status : "desactivados"} />
          <Row
            label="Último backup"
            value={
              backups.lastBackup
                ? `${backups.lastBackup.name} (${backups.lastBackup.ageMinutes} min)`
                : "—"
            }
          />
        </div>

        <div className="rounded-2xl border border-[var(--line)] p-4">
          <h3 className="font-semibold">IA (entorno base)</h3>
          <Row label="LLM_API_URL / HERMES_API_URL" value={yn(llm.env.LLM_API_URL)} />
          <Row label="API key env" value={yn(llm.env.LLM_API_KEY)} />
          <Row label="Modelo env" value={yn(llm.env.LLM_MODEL)} />
          <Row label="Allow demo env" value={yn(llm.env.LLM_ALLOW_DEMO)} />
          <Row
            label="Private URL allow"
            value={yn(llm.env.privateUrlAllowed)}
            hint="LLM_ALLOW_PRIVATE_URL / HERMES_ALLOW_PRIVATE_URL"
          />
          <Row
            label="Activo en DB"
            value={`${llm.config.preset} · ${llm.config.model}`}
          />
          <a href="#llm-settings" className="btn btn-ghost mt-3 inline-flex text-sm">
            Editar endpoints de IA
          </a>
        </div>
      </div>
    </section>
  );
}
