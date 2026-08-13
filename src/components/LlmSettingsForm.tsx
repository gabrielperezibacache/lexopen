"use client";

import { FormEvent, useEffect, useState } from "react";
import { llmEnvSnippet } from "@/lib/integrations/llm-env-snippet";

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
        : [data.note, data.error].filter(Boolean).join(" — ") ||
            "Prueba fallida"
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
    <form
      onSubmit={onSubmit}
      className="panel space-y-5 rounded-3xl p-5 md:p-6"
      data-testid="llm-settings-form"
    >
      <div>
        <h2 className="text-lg font-semibold">Endpoints de IA</h2>
        <p className="mt-1 text-sm text-[var(--ink-soft)]/70">
          Proveedor OpenAI-compatible para el copiloto: OpenAI, Azure OpenAI, Groq,
          Ollama, Hermes Agent o un endpoint personalizado. LexOpen llama a{" "}
          <code className="text-xs">{"{apiUrl}/chat/completions"}</code>{" "}
          (JSON; si el servidor hace stream SSE, LexOpen lo lee igual).
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Integración IA habilitada
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
            Ejemplos: <code>https://api.openai.com/v1</code>,{" "}
            <code>http://localhost:11434/v1</code> (Ollama),{" "}
            <code>http://localhost:8642/v1</code> (Hermes). También puede fijarse con{" "}
            <code>LLM_API_URL</code> / <code>HERMES_API_URL</code> en el entorno.
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
          <span className="mt-1 block text-xs text-[var(--ink-soft)]/60">
            Opcional en Ollama local. Variables: <code>LLM_API_KEY</code> /{" "}
            <code>HERMES_API_KEY</code>.
          </span>
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

      <div className="rounded-2xl border border-[var(--line)] bg-white/60 p-4 text-xs text-[var(--ink-soft)]/75">
        <p className="font-medium text-[var(--ink)]">
          Equivalente .env (sigue el formulario)
        </p>
        <p className="mt-1 text-[var(--ink-soft)]/70">
          Al pulsar Guardar IA esto queda en el Host (Postgres). No hace falta
          editar el <code>.env</code> salvo que quiera fijar el valor al arrancar.
        </p>
        <pre
          className="mt-2 overflow-x-auto rounded-xl bg-[var(--ink)] p-3 text-[11px] text-white/85"
          data-testid="llm-env-snippet"
        >{llmEnvSnippet(config)}</pre>
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
        <a href="/agente" className="btn btn-ghost inline-flex">
          Abrir copiloto
        </a>
      </div>
      {message && (
        <p
          className={`text-sm ${ok ? "text-[var(--sea)]" : "text-red-700"}`}
          role="status"
        >
          {message}
        </p>
      )}
    </form>
  );
}
