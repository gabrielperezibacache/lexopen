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
  const [google, setGoogle] = useState<GoogleStatus | null>(null);
  const [hermesInfo, setHermesInfo] = useState("");

  useEffect(() => {
    fetch("/api/integrations/google")
      .then((r) => r.json())
      .then(setGoogle)
      .catch(() => setGoogle(null));
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
        ? `Vault actualizado: ${data.synced} causas exportadas a ./obsidian-vault/LexOpen`
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
          Obsidian (vault Markdown), Hermes Agent (API) y Google Workspace (OAuth Drive / Calendar / Gmail).
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
            Exporta cada causa a carpetas Markdown (`Index.md`, Notas, Documentos) listas para abrir
            como vault o sincronizar con Local REST API.
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
            OAuth 2.0 para Drive (documentos), Calendar (plazos) y Gmail. Configure
            `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`.
          </p>
          <div className="mt-4 text-sm text-[var(--ink-soft)]/75">
            {google?.connected
              ? `Conectado: ${google.connectedEmail || "cuenta Google"}`
              : google?.credentialsConfigured
                ? "Credenciales OK — pendiente autorizar"
                : "Credenciales no configuradas (modo stub activo)"}
          </div>
          {google?.authUrl ? (
            <a href={google.authUrl} className="btn btn-primary mt-5 inline-flex">
              Conectar Google
            </a>
          ) : (
            <button className="btn btn-ghost mt-5" type="button" disabled>
              Configure OAuth en .env
            </button>
          )}
        </section>
      </div>

      <section className="panel rounded-3xl p-5">
        <h2 className="text-lg font-semibold">Variables de entorno</h2>
        <pre className="mt-3 overflow-x-auto rounded-2xl bg-[var(--ink)] p-4 text-xs text-white/85">{`HERMES_API_URL=http://localhost:8642/v1
OBSIDIAN_VAULT_PATH=./obsidian-vault
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/api/integrations/google/callback`}</pre>
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
