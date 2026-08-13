"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type GoogleStatus = {
  enabled: boolean;
  connected: boolean;
  connectedEmail: string | null;
  authUrl: string | null;
  canStartOauth?: boolean;
  credentialsConfigured: boolean;
};

type CaptchaStatus = {
  ok: boolean;
  captcha?: {
    configured: boolean;
    provider: string | null;
    freeTier?: boolean;
    keyPresent?: boolean;
    fallbacks?: string[];
    configError?: string | null;
    envSnippet?: string;
    providers?: {
      id: string;
      label: string;
      freeTier: boolean;
      keyRequired: boolean;
      note: string;
      url: string;
      selected?: boolean;
    }[];
  };
  sidecar?: {
    configured: boolean;
    reachable: boolean;
    scrapeReady: boolean | null;
    urlHost: string | null;
    error: string | null;
  };
  publicScrapeReady?: boolean;
  liveIngestConfigured?: boolean;
  honesty?: string;
};

function IntegracionesInner() {
  const sp = useSearchParams();
  const [obsidianMsg, setObsidianMsg] = useState("");
  const [obsidianMode, setObsidianMode] = useState("");
  const [google, setGoogle] = useState<GoogleStatus | null>(null);
  const [llmInfo, setLlmInfo] = useState("");
  const [captcha, setCaptcha] = useState<CaptchaStatus | null>(null);

  useEffect(() => {
    fetch("/api/integrations/google")
      .then((r) => r.json())
      .then(setGoogle)
      .catch(() => setGoogle(null));
    fetch("/api/integrations/obsidian")
      .then((r) => r.json())
      .then((d) => {
        const label = d.mode?.label || d.mode?.mode;
        const detail = d.mode?.detail;
        setObsidianMode(
          label
            ? detail
              ? `${label} · ${detail}`
              : String(label)
            : d.config?.vaultPath || "storage"
        );
      })
      .catch(() => setObsidianMode("storage"));
    fetch("/api/integrations/llm")
      .then((r) => r.json())
      .then((d) =>
        setLlmInfo(
          `${d.config?.preset || "custom"} · ${d.config?.apiUrl || "—"} · modelo ${
            d.config?.model || "—"
          } · ${d.enabled ? "habilitado" : "deshabilitado"}`
        )
      )
      .catch(() => setLlmInfo("No disponible"));
    fetch("/api/pjud/captcha")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCaptcha(d))
      .catch(() => setCaptcha(null));
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
        ? `Exportación: ${data.synced ?? 0} ok` +
            (data.failed ? `, ${data.failed} con error` : "") +
            ` · ${data.mode?.label || data.results?.[0]?.mode || "storage"}`
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
        <h1 className="display mt-2 break-words text-2xl sm:text-3xl md:text-4xl">Integraciones</h1>
        <p className="mt-2 max-w-2xl text-[var(--ink-soft)]/80">
          Obsidian (vault Markdown), copiloto IA multi-proveedor (OpenAI / custom /
          Hermes), Google Workspace y PJUD (scrape / ClaveÚnica / sidecar).
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
          <h2 className="text-xl font-semibold">Copiloto IA</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]/80">
            API compatible con OpenAI Chat Completions: OpenAI, Azure, Groq, Ollama,
            Hermes u otro endpoint custom. Utilidades tipo Julia.cl con fuentes del
            estudio. Configure proveedor y API key en Configuración.
          </p>
          <p className="mt-4 text-xs text-[var(--ink-soft)]/65">{llmInfo || "Cargando…"}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <a href="/agente" className="btn btn-secondary inline-flex">
              Abrir copiloto
            </a>
            <a href="/configuracion#llm-settings" className="btn btn-ghost inline-flex">
              Configurar endpoint
            </a>
          </div>
        </section>

        <section className="panel rounded-3xl p-5">
          <h2 className="text-xl font-semibold">Google Workspace</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]/80">
            OAuth 2.0 para Drive (carpeta por causa + archivos/minutas), Calendar
            (plazos) y Gmail (digests). En cada causa puede crear la carpeta del
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
            {google?.canStartOauth || google?.credentialsConfigured ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={async () => {
                  const res = await fetch("/api/integrations/google", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "start-oauth" }),
                  });
                  const data = await res.json().catch(() => ({}));
                  if (res.ok && data.authUrl) {
                    window.location.href = data.authUrl as string;
                  }
                }}
              >
                {google?.connected ? "Reconectar Google" : "Conectar Google"}
              </button>
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
            <a href="/configuracion#google-settings" className="btn btn-ghost inline-flex">
              Opciones Drive/Calendar
            </a>
          </div>
        </section>
      </div>

      <section className="panel rounded-3xl p-5">
        <h2 className="text-xl font-semibold">PJUD / CausaMonitor</h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]/80">
          Ingest live vía partner API, scraper sidecar o scrape OJV (CAPTCHA
          BYOK). Sin CAPTCHA puede usar CSV/demo. Mis Causas con ClaveÚnica
          cifrada en{" "}
          <Link href="/causas/mis-causas" className="text-[var(--sea)]">
            /causas/mis-causas
          </Link>
          . Detalle en <code>docs/PJUD.md</code>.
        </p>
        {captcha && (
          <div className="mt-4 space-y-3 rounded-2xl border border-[var(--line)] bg-white/70 p-4 text-sm">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[var(--ink-soft)]/80">
              <span>
                CAPTCHA:{" "}
                <strong className="text-[var(--ink)]">
                  {captcha.captcha?.configured
                    ? captcha.captcha.provider || "on"
                    : "off"}
                </strong>
                {captcha.captcha?.freeTier ? " · free tier" : ""}
                {captcha.captcha?.keyPresent ? " · key" : ""}
              </span>
              <span>
                Sidecar:{" "}
                <strong className="text-[var(--ink)]">
                  {!captcha.sidecar?.configured
                    ? "no config"
                    : captcha.sidecar.reachable
                      ? captcha.sidecar.scrapeReady
                        ? "ready"
                        : "up"
                      : "down"}
                </strong>
                {captcha.sidecar?.urlHost ? ` (${captcha.sidecar.urlHost})` : ""}
              </span>
              <span>
                Live ingest:{" "}
                <strong className="text-[var(--ink)]">
                  {captcha.liveIngestConfigured ? "sí" : "no"}
                </strong>
              </span>
            </div>
            {captcha.captcha?.configError && (
              <p className="text-amber-900">{captcha.captcha.configError}</p>
            )}
            {captcha.honesty && (
              <p className="text-xs text-[var(--ink-soft)]/70">{captcha.honesty}</p>
            )}
            {captcha.captcha?.providers && (
              <ul className="grid gap-2 sm:grid-cols-2">
                {captcha.captcha.providers.map((p) => (
                  <li
                    key={p.id}
                    className={`rounded-xl border px-3 py-2 ${
                      p.selected
                        ? "border-[var(--sea)]/40 bg-[rgba(31,122,140,0.06)]"
                        : "border-[var(--line)]"
                    }`}
                  >
                    <div className="font-medium">
                      {p.label}{" "}
                      <code className="text-xs text-[var(--ink-soft)]/70">
                        {p.id}
                      </code>
                      {p.freeTier ? (
                        <span className="ml-2 text-xs text-[var(--ok)]">free</span>
                      ) : null}
                      {p.selected ? (
                        <span className="ml-2 text-xs text-[var(--sea)]">activo</span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-[var(--ink-soft)]/70">{p.note}</p>
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block text-xs text-[var(--sea)]"
                    >
                      Sitio →
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {captcha.captcha?.envSnippet && (
              <pre className="overflow-x-auto rounded-xl bg-[var(--ink)] p-3 text-xs text-white/85">
                {captcha.captcha.envSnippet}
              </pre>
            )}
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/causas/monitoreo" className="btn btn-secondary">
            Monitoreo
          </Link>
          <Link href="/causas/mis-causas" className="btn btn-ghost">
            Mis Causas CU
          </Link>
        </div>
      </section>

      <section className="panel rounded-3xl p-5">
        <h2 className="text-lg font-semibold">Variables de entorno</h2>
        <pre className="mt-3 overflow-x-auto rounded-2xl bg-[var(--ink)] p-4 text-xs text-white/85">{`# IA multi-proveedor (prioridad sobre HERMES_*)
LLM_API_URL=https://api.openai.com/v1
LLM_API_KEY=
LLM_MODEL=gpt-4o-mini
LLM_ALLOW_DEMO=0
# Compat Hermes Agent
HERMES_API_URL=http://localhost:8642/v1
HERMES_API_KEY=
OBSIDIAN_VAULT_PATH=./obsidian-vault
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/api/integrations/google/callback
PJUD_API_URL=
PJUD_API_KEY=
PJUD_SCRAPER_URL=http://127.0.0.1:8787
PJUD_SCRAPER_ALLOW_PRIVATE=1
PJUD_PUBLIC_SCRAPE=1
# PJUD_CLAVEUNICA_SCRAPE=0  # kill switch; ausente = opt-in al guardar credenciales
CAPTCHA_SOLVER_PROVIDER=nopecha
CAPTCHA_SOLVER_API_KEY=
# En VPS: CAPTCHA_SOLVER_FALLBACK=2captcha
# CAPTCHA_SOLVER_FALLBACK_API_KEY=...
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
