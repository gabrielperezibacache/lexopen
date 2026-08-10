"use client";

import { FormEvent, useEffect, useState } from "react";

type PresetKey = "openai" | "azure" | "groq" | "ollama" | "hermes" | "custom";

type LlmConfig = {
  preset: PresetKey;
  apiUrl: string;
  apiKey: string;
  model: string;
  requireApproval: boolean;
  allowDemo: boolean;
  hasApiKey?: boolean;
};

type PresetInfo = { label: string; apiUrl: string; model: string };

export function LlmSettingsForm() {
  const [enabled, setEnabled] = useState(true);
  const [config, setConfig] = useState<LlmConfig>({
    preset: "openai",
    apiUrl: "https://api.openai.com/v1",
    apiKey: "",
    model: "gpt-4o-mini",
    requireApproval: true,
    allowDemo: true,
  });
  const [presets, setPresets] = useState<Record<string, PresetInfo>>({});
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(false);
  const [testing, setTesting] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/integrations/llm")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setEnabled(Boolean(data.enabled));
        if (data.config) setConfig({ ...data.config });
        if (data.presets) setPresets(data.presets);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  function onPresetChange(preset: PresetKey) {
    const p = presets[preset];
    setConfig((c) => ({
      ...c,
      preset,
      apiUrl: p?.apiUrl || c.apiUrl,
      model: p?.model || c.model,
    }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    setOk(false);
    const res = await fetch("/api/integrations/llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save-config",
        enabled,
        config: {
          preset: config.preset,
          apiUrl: config.apiUrl,
          apiKey: config.apiKey,
          model: config.model,
          requireApproval: config.requireApproval,
          allowDemo: config.allowDemo,
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    setOk(res.ok);
    setMessage(res.ok ? "Configuración IA guardada" : data.error || "Error al guardar");
    if (res.ok && data.config) setConfig({ ...data.config });
  }

  async function onTest() {
    setTesting(true);
    setMessage("");
    // Persist current form first so test uses latest values
    await fetch("/api/integrations/llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save-config",
        enabled,
        config,
      }),
    });
    const res = await fetch("/api/integrations/llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "test" }),
    });
    const data = await res.json().catch(() => ({}));
    setTesting(false);
    setOk(Boolean(data.ok));
    setMessage(
      data.ok
        ? `Conexión OK · ${data.provider}/${data.model}: ${data.preview}`
        : data.error || data.note || "Prueba fallida"
    );
  }

  if (!loaded) {
    return (
      <div className="panel rounded-3xl p-5 text-sm text-[var(--ink-soft)]/70">
        Cargando configuración de IA…
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="panel space-y-5 rounded-3xl p-5 md:p-6">
      <div>
        <h2 className="text-lg font-semibold">Asistente IA (multi-proveedor)</h2>
        <p className="mt-1 text-sm text-[var(--ink-soft)]/70">
          Conecte cualquier API compatible con OpenAI Chat Completions: OpenAI,
          Azure, Groq, Ollama, Hermes u otro endpoint custom.
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
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Proveedor (preset)</span>
          <select
            className="select"
            value={config.preset}
            onChange={(e) => onPresetChange(e.target.value as PresetKey)}
          >
            {Object.entries(presets).map(([key, p]) => (
              <option key={key} value={key}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Modelo</span>
          <input
            className="input"
            value={config.model}
            onChange={(e) => setConfig((c) => ({ ...c, model: e.target.value }))}
            placeholder="gpt-4o-mini"
            required
          />
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="mb-1 block font-medium">Endpoint (base URL)</span>
          <input
            className="input"
            value={config.apiUrl}
            onChange={(e) => setConfig((c) => ({ ...c, apiUrl: e.target.value }))}
            placeholder="https://api.openai.com/v1"
            required
          />
          <span className="mt-1 block text-xs text-[var(--ink-soft)]/60">
            Se llama a {"{apiUrl}/chat/completions"}
          </span>
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="mb-1 block font-medium">API key</span>
          <input
            className="input"
            type="password"
            value={config.apiKey}
            onChange={(e) => setConfig((c) => ({ ...c, apiKey: e.target.value }))}
            placeholder={config.hasApiKey ? "•••• (dejar para conservar)" : "sk-…"}
            autoComplete="off"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={config.requireApproval}
            onChange={(e) =>
              setConfig((c) => ({ ...c, requireApproval: e.target.checked }))
            }
          />
          Requiere aprobación humana
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={config.allowDemo}
            onChange={(e) =>
              setConfig((c) => ({ ...c, allowDemo: e.target.checked }))
            }
          />
          Permitir respuestas demo si el proveedor no responde
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" type="submit">
          Guardar IA
        </button>
        <button
          className="btn btn-secondary"
          type="button"
          disabled={testing}
          onClick={onTest}
        >
          {testing ? "Probando…" : "Probar conexión"}
        </button>
      </div>
      {message && (
        <p
          className={`text-sm ${ok ? "text-[var(--sea)]" : "text-[var(--copper)]"}`}
          role="status"
        >
          {message}
        </p>
      )}
    </form>
  );
}
