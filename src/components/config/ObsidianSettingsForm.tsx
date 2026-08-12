"use client";

import { FormEvent, useEffect, useState } from "react";

type ObsidianConfig = {
  vaultPath: string;
  folderPrefix: string;
  syncNotes: boolean;
  syncDocumentos: boolean;
};

export function ObsidianSettingsForm() {
  const [enabled, setEnabled] = useState(true);
  const [config, setConfig] = useState<ObsidianConfig>({
    vaultPath: "./obsidian-vault",
    folderPrefix: "LexOpen",
    syncNotes: true,
    syncDocumentos: true,
  });
  const [restConfigured, setRestConfigured] = useState(false);
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetch("/api/integrations/obsidian")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setEnabled(Boolean(data.enabled));
        if (data.config) setConfig({ ...data.config });
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    fetch("/api/admin/config-snapshot")
      .then((r) => (r.ok ? r.json() : null))
      .then((snap) => {
        if (snap?.obsidian) setRestConfigured(Boolean(snap.obsidian.restConfigured));
      })
      .catch(() => undefined);
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    setOk(false);
    const res = await fetch("/api/integrations/obsidian", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save-config",
        enabled,
        config,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setOk(res.ok);
    setMessage(res.ok ? "Obsidian guardado" : data.error || "Error al guardar");
  }

  async function onSync() {
    setSyncing(true);
    setMessage("");
    const res = await fetch("/api/integrations/obsidian", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sync-all" }),
    });
    const data = await res.json().catch(() => ({}));
    setSyncing(false);
    setOk(res.ok);
    setMessage(
      res.ok
        ? `Exportación: ${data.synced ?? 0} causas`
        : data.error || "Error al sincronizar"
    );
  }

  if (!loaded) {
    return (
      <div className="panel rounded-3xl p-5 text-sm text-[var(--ink-soft)]/70">
        Cargando Obsidian…
      </div>
    );
  }

  return (
    <form
      id="obsidian-settings"
      onSubmit={onSubmit}
      className="panel space-y-5 rounded-3xl p-5 md:p-6"
      data-testid="obsidian-settings-form"
    >
      <div>
        <h2 className="text-lg font-semibold">Obsidian</h2>
        <p className="mt-1 text-sm text-[var(--ink-soft)]/70">
          Exportación Markdown de causas. Destino: Local REST si{" "}
          <code>OBSIDIAN_REST_URL</code> está definido; si no, storage (y vault local en
          desarrollo).
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Integración habilitada
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm md:col-span-2">
          <span className="mb-1 block font-medium">Ruta del vault</span>
          <input
            className="input"
            value={config.vaultPath}
            onChange={(e) =>
              setConfig((c) => ({ ...c, vaultPath: e.target.value }))
            }
            placeholder="./obsidian-vault"
          />
          <span className="mt-1 block text-xs text-[var(--ink-soft)]/60">
            Variable de entorno: <code>OBSIDIAN_VAULT_PATH</code>
            {restConfigured ? " · REST API detectada" : ""}
          </span>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Prefijo de carpeta</span>
          <input
            className="input"
            value={config.folderPrefix}
            onChange={(e) =>
              setConfig((c) => ({ ...c, folderPrefix: e.target.value }))
            }
            placeholder="LexOpen"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={config.syncNotes}
            onChange={(e) =>
              setConfig((c) => ({ ...c, syncNotes: e.target.checked }))
            }
          />
          Incluir notas
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={config.syncDocumentos}
            onChange={(e) =>
              setConfig((c) => ({ ...c, syncDocumentos: e.target.checked }))
            }
          />
          Incluir documentos no confidenciales
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" type="submit">
          Guardar Obsidian
        </button>
        <button
          className="btn btn-secondary"
          type="button"
          disabled={syncing}
          onClick={onSync}
        >
          {syncing ? "Sincronizando…" : "Sincronizar vault"}
        </button>
      </div>
      {message && (
        <p className={`text-sm ${ok ? "text-[var(--sea)]" : "text-red-700"}`} role="status">
          {message}
        </p>
      )}
    </form>
  );
}
