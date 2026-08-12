"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type GoogleStatus = {
  enabled: boolean;
  connected: boolean;
  connectedEmail: string | null;
  authUrl: string | null;
  credentialsConfigured: boolean;
};

function IntegracionesInner() {
  const sp = useSearchParams();
  const [obsidianMsg, setObsidianMsg] = useState("");
  const [obsidianMode, setObsidianMode] = useState("");
  const [google, setGoogle] = useState<GoogleStatus | null>(null);
  const [hermesInfo, setHermesInfo] = useState("");

  useEffect(() => {
    fetch("/api/integrations/google")
      .then((r) => r.json())
      .then(setGoogle)
      .catch(() => setGoogle(null));
    fetch("/api/integrations/obsidian")
      .then((r) => r.json())
      .then((d) =>
        setObsidianMode(
          process.env.NODE_ENV === "production"
            ? d.config?.vaultPath
              ? "storage/REST"
              : "storage"
            : d.config?.vaultPath || "storage"
        )
      )
      .catch(() => setObsidianMode("storage"));
    fetch("/api/integrations/hermes")
      .then((r) => r.json())
      .then((d) =>
        setHermesInfo(
          `API: ${d.config?.apiUrl || "—"} · modelo ${d.config?.model || "—"} · ${
            d.enabled ? "habilitado" : "deshabilitado"
          }`
        )
      )
      .catch(() => setHermesInfo("No disponible"));
  }, []);

  async function syncObsidian() {
    setObsidianMsg("Sincronizando…");
    const res = await fetch("/api/integrations/obsidian", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sync-all" }),
    });
    const data = await res.json();
    setObsidianMsg(
      res.ok
        ? `Exportación completa: ${data.synced} causas (${data.results?.[0]?.mode || "storage"}).`
        : data.error || "Error"
    );
  }

  const googleFlash = sp.get("google");

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--sea)]">
          Conectores
        </p>
        <h1 className="display mt-2 text-4xl">Integraciones</h1>
        <p className="mt-2 max-w-2xl text-[var(--ink-soft)]/80">
          Obsidian (vault Markdown), Hermes Agent (API), Google Workspace y
          PJUD (scrape / ClaveÚnica / sidecar).
        </p>
      </div>

      {googleFlash && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            googleFlash === "connected" || googleFlash === "ok"
              ? "border-[var(--ok)]/30 bg-[rgba(31,122,76,0.08)] text-[var(--ink)]"
              : "border-[var(--line)] bg-white/80 text-[var(--ink-soft)]/85"
          }`}
        >
          {googleFlash === "connected" || googleFlash === "ok"
            ? "Google Workspace conectado correctamente."
            : googleFlash === "error"
              ? `No se pudo completar OAuth${sp.get("msg") ? `: ${sp.get("msg")}` : "."}`
              : `Estado Google: ${googleFlash}${sp.get("msg") ? ` — ${sp.get("msg")}` : ""}`}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="panel rounded-3xl p-5">
          <h2 className="text-xl font-semibold">Obsidian</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]/80">
            Exporta cada causa como Markdown. Si `OBSIDIAN_REST_URL` está configurado,
            escribe vía Local REST; si no, guarda los `.md` en storage. En desarrollo
            también puede escribir en un vault local.
          </p>
          <p className="mt-3 text-xs text-[var(--ink-soft)]/65">
            Destino actual: {obsidianMode || "cargando..."}
          </p>
          <button className="btn btn-primary mt-5" type="button" onClick={syncObsidian}>
            Sincronizar vault
          </button>
          {obsidianMsg && <p className="mt-3 text-sm text-[var(--ink-soft)]/75">{obsidianMsg}</p>}
        </section>

        <section className="panel rounded-3xl p-5">
          <h2 className="text-xl font-semibold">Hermes Agent</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]/80">
            Cliente HTTP compatible con OpenAI hacia el API server de Hermes. Si no hay agente
            local, LexOpen responde en modo demo con guardrails.
          </p>
          <p className="mt-4 text-xs text-[var(--ink-soft)]/65">{hermesInfo || "Cargando…"}</p>
          <a href="/agente" className="btn btn-secondary mt-5 inline-flex">
            Abrir consola Hermes
          </a>
        </section>

        <section className="panel rounded-3xl p-5">
          <h2 className="text-xl font-semibold">Google Workspace</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]/80">
            OAuth 2.0 para Drive (carpeta por causa + documentos/minutas), Calendar
            (plazos) y Gmail. En cada causa puede vincular o crear la carpeta del
            expediente. Configure `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`.
          </p>
          <div className="mt-4 text-sm text-[var(--ink-soft)]/75">
            {google?.connected
              ? `Conectado: ${google.connectedEmail || "cuenta Google"}`
              : google?.credentialsConfigured
                ? "Credenciales OK — pendiente autorizar"
                : "Credenciales no configuradas (modo stub activo)"}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {google?.authUrl ? (
              <a href={google.authUrl} className="btn btn-primary inline-flex">
                {google.connected ? "Reconectar Google" : "Conectar Google"}
              </a>
            ) : (
              <button className="btn btn-ghost" type="button" disabled>
                Configure OAuth en el entorno
              </button>
            )}
            {google?.connected && (
              <button
                className="btn btn-ghost"
                type="button"
                onClick={async () => {
                  await fetch("/api/integrations/google", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "disconnect" }),
                  });
                  const r = await fetch("/api/integrations/google");
                  setGoogle(await r.json());
                }}
              >
                Desconectar
              </button>
            )}
          </div>
        </section>
      </div>

      <section className="panel rounded-3xl p-5">
        <h2 className="text-xl font-semibold">PJUD / CausaMonitor</h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]/80">
          Ingest live vía partner API, scraper sidecar o scrape OJV (CAPTCHA
          BYOK). Proveedores: <code>nopecha</code> (free ~100/día IP
          residencial), <code>2captcha</code>, <code>capsolver</code>,{" "}
          <code>anticaptcha</code>, <code>capmonster</code>. Sin CAPTCHA puede
          usar CSV/demo. Mis Causas con ClaveÚnica cifrada en{" "}
          <a href="/causas/mis-causas" className="text-[var(--sea)]">
            /causas/mis-causas
          </a>
          . Detalle en <code>docs/PJUD.md</code>.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href="/causas/monitoreo" className="btn btn-secondary">
            Monitoreo
          </a>
          <a href="/causas/mis-causas" className="btn btn-ghost">
            Mis Causas CU
          </a>
        </div>
      </section>

      <section className="panel rounded-3xl p-5">
        <h2 className="text-lg font-semibold">Variables de entorno</h2>
        <pre className="mt-3 overflow-x-auto rounded-2xl bg-[var(--ink)] p-4 text-xs text-white/85">{`HERMES_API_URL=http://localhost:8642/v1
OBSIDIAN_VAULT_PATH=./obsidian-vault
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/api/integrations/google/callback
PJUD_SCRAPER_URL=
PJUD_PUBLIC_SCRAPE=0
PJUD_CLAVEUNICA_SCRAPE=0
# nopecha (free) | 2captcha | capsolver | anticaptcha | capmonster
CAPTCHA_SOLVER_PROVIDER=nopecha
CAPTCHA_SOLVER_API_KEY=
PJUD_SECRETS_KEY=`}</pre>
      </section>
    </div>
  );
}

export default function IntegracionesPage() {
  return (
    <Suspense fallback={<div className="panel h-40 rounded-3xl" />}>
      <IntegracionesInner />
    </Suspense>
  );
}
