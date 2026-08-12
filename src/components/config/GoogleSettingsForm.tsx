"use client";

import { FormEvent, useEffect, useState } from "react";

type GoogleState = {
  enabled: boolean;
  connected: boolean;
  connectedEmail: string | null;
  canStartOauth: boolean;
  credentialsConfigured: boolean;
  syncDrive: boolean;
  syncCalendar: boolean;
  redirectUri?: string | null;
};

export function GoogleSettingsForm() {
  const [state, setState] = useState<GoogleState | null>(null);
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(false);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [google, snap] = await Promise.all([
        fetch("/api/integrations/google").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/admin/config-snapshot").then((r) => (r.ok ? r.json() : null)),
      ]);
      if (cancelled) return;
      if (!google) {
        setState(null);
        return;
      }
      setState({
        enabled: Boolean(google.enabled),
        connected: Boolean(google.connected),
        connectedEmail: google.connectedEmail || null,
        canStartOauth: Boolean(
          google.canStartOauth ?? google.credentialsConfigured
        ),
        credentialsConfigured: Boolean(google.credentialsConfigured),
        syncDrive: Boolean(google.config?.syncDrive ?? true),
        syncCalendar: Boolean(google.config?.syncCalendar ?? true),
        redirectUri: snap?.google?.redirectUri || null,
      });
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function reload() {
    const [google, snap] = await Promise.all([
      fetch("/api/integrations/google").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/admin/config-snapshot").then((r) => (r.ok ? r.json() : null)),
    ]);
    if (!google) {
      setState(null);
      return;
    }
    setState({
      enabled: Boolean(google.enabled),
      connected: Boolean(google.connected),
      connectedEmail: google.connectedEmail || null,
      canStartOauth: Boolean(
        google.canStartOauth ?? google.credentialsConfigured
      ),
      credentialsConfigured: Boolean(google.credentialsConfigured),
      syncDrive: Boolean(google.config?.syncDrive ?? true),
      syncCalendar: Boolean(google.config?.syncCalendar ?? true),
      redirectUri: snap?.google?.redirectUri || null,
    });
  }

  async function startOauth() {
    setConnecting(true);
    setMessage("");
    try {
      const res = await fetch("/api/integrations/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start-oauth" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.authUrl) {
        setOk(false);
        setMessage(data.error || "No se pudo iniciar OAuth");
        return;
      }
      window.location.href = data.authUrl as string;
    } catch {
      setOk(false);
      setMessage("Error de red al iniciar OAuth");
    } finally {
      setConnecting(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!state) return;
    setMessage("");
    const res = await fetch("/api/integrations/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save-config",
        enabled: state.enabled,
        config: {
          syncDrive: state.syncDrive,
          syncCalendar: state.syncCalendar,
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    setOk(res.ok);
    setMessage(res.ok ? "Google guardado" : data.error || "Error al guardar");
    if (res.ok) await reload();
  }

  if (!state) {
    return (
      <div className="panel rounded-3xl p-5 text-sm text-[var(--ink-soft)]/70">
        Cargando Google Workspace…
      </div>
    );
  }

  return (
    <form
      id="google-settings"
      onSubmit={onSubmit}
      className="panel space-y-5 rounded-3xl p-5 md:p-6"
      data-testid="google-settings-form"
    >
      <div>
        <h2 className="text-lg font-semibold">Google Workspace</h2>
        <p className="mt-1 text-sm text-[var(--ink-soft)]/70">
          OAuth para Drive (carpetas por causa + archivos/minutas), Calendar
          (plazos) y Gmail (digests PJUD). Credenciales:{" "}
          <code>GOOGLE_CLIENT_ID</code> / <code>GOOGLE_CLIENT_SECRET</code>.
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--line)] bg-white/70 p-4 text-sm">
        <p>
          Estado:{" "}
          <strong>
            {state.connected
              ? `conectado${state.connectedEmail ? ` (${state.connectedEmail})` : ""}`
              : state.credentialsConfigured
                ? "credenciales OK — pendiente autorizar"
                : "credenciales no configuradas"}
          </strong>
        </p>
        {state.redirectUri && (
          <p className="mt-2 text-xs text-[var(--ink-soft)]/65">
            Redirect URI: <code>{state.redirectUri}</code>
          </p>
        )}
        <p className="mt-2 text-xs text-[var(--ink-soft)]/65">
          Scope <code>drive.file</code>: LexOpen puede crear carpetas y subir
          archivos; vincular carpetas ajenas solo funciona si Drive las expone a
          la app.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={state.enabled}
          onChange={(e) => setState({ ...state, enabled: e.target.checked })}
        />
        Integración habilitada
      </label>

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={state.syncDrive}
            onChange={(e) => setState({ ...state, syncDrive: e.target.checked })}
          />
          Sincronizar Drive
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={state.syncCalendar}
            onChange={(e) =>
              setState({ ...state, syncCalendar: e.target.checked })
            }
          />
          Sincronizar Calendar
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" type="submit">
          Guardar Google
        </button>
        {state.canStartOauth ? (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={connecting}
            onClick={() => void startOauth()}
          >
            {connecting
              ? "Redirigiendo…"
              : state.connected
                ? "Reconectar"
                : "Conectar Google"}
          </button>
        ) : (
          <button className="btn btn-ghost" type="button" disabled>
            Configure OAuth en el entorno
          </button>
        )}
        {state.connected && (
          <button
            className="btn btn-ghost"
            type="button"
            onClick={async () => {
              await fetch("/api/integrations/google", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "disconnect" }),
              });
              await reload();
              setOk(true);
              setMessage("Google desconectado");
            }}
          >
            Desconectar
          </button>
        )}
      </div>
      {message && (
        <p className={`text-sm ${ok ? "text-[var(--sea)]" : "text-red-700"}`} role="status">
          {message}
        </p>
      )}
    </form>
  );
}
