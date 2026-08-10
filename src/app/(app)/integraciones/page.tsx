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
  const [llmInfo, setLlmInfo] = useState("");

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
          Obsidian (vault Markdown), asistente IA multi-proveedor y Google Workspace
          (OAuth Drive / Calendar / Gmail).
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
          <h2 className="text-xl font-semibold">Asistente IA</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]/80">
            OpenAI Chat Completions compatible (OpenAI, Azure, Groq, Ollama, Hermes u
            otro). Configure endpoint y API key en Configuración; use el chat por
            carpeta de cliente en CRM.
          </p>
          <p className="mt-4 text-xs text-[var(--ink-soft)]/65">{llmInfo || "Cargando…"}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <a href="/agente" className="btn btn-secondary inline-flex">
              Abrir asistente
            </a>
            <a href="/configuracion" className="btn btn-ghost inline-flex">
              Configurar proveedor
            </a>
          </div>
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
