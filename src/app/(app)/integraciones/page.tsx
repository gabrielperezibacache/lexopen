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

type ObsidianStatus = {
  modeLabel?: string;
  modeDetail?: string;
  honesty?: string;
  restConfigured?: boolean;
  enabled?: boolean;
};

type HermesStatus = {
  demoAllowed?: boolean;
  statusHint?: string;
  enabled?: boolean;
  probe?: { ok: boolean; detail: string };
  config?: { apiUrl?: string; model?: string };
};

function IntegracionesInner() {
  const sp = useSearchParams();
  const [obsidianMsg, setObsidianMsg] = useState("");
  const [obsidian, setObsidian] = useState<ObsidianStatus | null>(null);
  const [google, setGoogle] = useState<GoogleStatus | null>(null);
  const [hermes, setHermes] = useState<HermesStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/integrations/google")
      .then((r) => r.json())
      .then(setGoogle)
      .catch(() => setGoogle(null));
    fetch("/api/integrations/obsidian")
      .then((r) => r.json())
      .then(setObsidian)
      .catch(() => setObsidian(null));
    fetch("/api/integrations/hermes?probe=1")
      .then((r) => r.json())
      .then(setHermes)
      .catch(() => setHermes(null));
  }, []);

  async function syncObsidian() {
    setBusy(true);
    setObsidianMsg("Sincronizando…");
    const res = await fetch("/api/integrations/obsidian", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sync-all" }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setObsidianMsg(data.error || "Error al sincronizar");
      return;
    }
    const mode = data.mode?.label || data.results?.[0]?.mode || "storage";
    const failed = data.failed || 0;
    const warns = (data.results || [])
      .flatMap((r: { warnings?: string[] }) => r.warnings || [])
      .slice(0, 3);
    const warnNote = warns.length ? ` · ${warns.join(" · ")}` : "";
    setObsidianMsg(
      failed
        ? `Export parcial: ${data.synced} ok, ${failed} con error · ${mode}${warnNote}`
        : `Exportación completa: ${data.synced} causas · ${mode}${warnNote}`
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
          Obsidian (Markdown), Hermes Agent (API) y Google Workspace. En
          producción LexOpen evita stubs silenciosos.
        </p>
      </div>

      {googleFlash && (
        <div className="rounded-2xl border border-[var(--line)] bg-white/80 px-4 py-3 text-sm">
          Google OAuth: {googleFlash}
          {sp.get("msg") ? ` — ${sp.get("msg")}` : ""}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="panel rounded-3xl p-5">
          <h2 className="text-xl font-semibold">Obsidian</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]/80">
            Exporta cada causa como Markdown. Omite minutas y documentos
            confidenciales. Prefiere Local REST; si no, object storage (Render
            no conserva vault local).
          </p>
          <p className="mt-3 text-xs text-[var(--ink-soft)]/65" role="status">
            {obsidian?.modeLabel || "Cargando…"}
            {obsidian?.modeDetail ? ` · ${obsidian.modeDetail}` : ""}
          </p>
          {obsidian?.honesty && (
            <p className="mt-2 text-xs text-[var(--copper)]">{obsidian.honesty}</p>
          )}
          <button
            className="btn btn-primary mt-5"
            type="button"
            onClick={syncObsidian}
            disabled={busy}
          >
            {busy ? "Sincronizando…" : "Sincronizar vault"}
          </button>
          {obsidianMsg && (
            <p className="mt-3 text-sm text-[var(--ink-soft)]/75">{obsidianMsg}</p>
          )}
        </section>

        <section className="panel rounded-3xl p-5">
          <h2 className="text-xl font-semibold">Hermes Agent</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]/80">
            Cliente HTTP OpenAI-compatible. Fail-closed en producción salvo
            `HERMES_ALLOW_DEMO=1`. Las respuestas demo siempre van etiquetadas.
          </p>
          <p className="mt-4 text-xs text-[var(--ink-soft)]/65">
            API: {hermes?.config?.apiUrl || "—"} · modelo{" "}
            {hermes?.config?.model || "—"} ·{" "}
            {hermes?.enabled ? "habilitado" : "deshabilitado"}
            {hermes?.probe
              ? ` · probe: ${hermes.probe.ok ? "ok" : "fallo"} (${hermes.probe.detail})`
              : ""}
          </p>
          <p
            className={`mt-2 text-xs ${
              hermes?.demoAllowed ? "text-[var(--copper)]" : "text-[var(--sea)]"
            }`}
          >
            {hermes?.statusHint || "Cargando estado…"}
          </p>
          <a href="/agente" className="btn btn-secondary mt-5 inline-flex">
            Abrir consola Hermes
          </a>
        </section>

        <section className="panel rounded-3xl p-5">
          <h2 className="text-xl font-semibold">Google Workspace</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]/80">
            OAuth 2.0 para Drive (carpeta por causa), Calendar (plazos) y Gmail.
            Configure `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`.
          </p>
          <div className="mt-4 text-sm text-[var(--ink-soft)]/75">
            {google?.connected
              ? `Conectado: ${google.connectedEmail || "cuenta Google"}`
              : google?.credentialsConfigured
                ? "Credenciales OK — pendiente autorizar"
                : "Credenciales no configuradas"}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {google?.authUrl ? (
              <a href={google.authUrl} className="btn btn-primary inline-flex">
                {google.connected ? "Reconectar Google" : "Conectar Google"}
              </a>
            ) : (
              <button className="btn btn-ghost" type="button" disabled>
                Configure OAuth en .env
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
        <h2 className="text-lg font-semibold">Variables de entorno</h2>
        <pre className="mt-3 overflow-x-auto rounded-2xl bg-[var(--ink)] p-4 text-xs text-white/85">{`HERMES_API_URL=http://localhost:8642/v1
HERMES_API_KEY=
HERMES_ALLOW_DEMO=0
OBSIDIAN_VAULT_PATH=./obsidian-vault
OBSIDIAN_REST_URL=http://127.0.0.1:27123
OBSIDIAN_REST_API_KEY=
# alias: OBSIDIAN_REST_TOKEN=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/integrations/google/callback`}</pre>
      </section>
    </div>
  );
}

export default function IntegracionesPage() {
  return (
    <Suspense fallback={<div className="panel h-40 animate-pulse rounded-3xl" />}>
      <IntegracionesInner />
    </Suspense>
  );
}
