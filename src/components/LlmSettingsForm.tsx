"use client";

import { FormEvent, useEffect, useState } from "react";
import { llmEnvSnippet } from "@/lib/integrations/llm-env-snippet";
import { apiMutation } from "@/lib/api-mutation";

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
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [clearApiKey, setClearApiKey] = useState(false);
  const [demoFailClosed, setDemoFailClosed] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    fetch("/api/integrations/llm")
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          throw new Error(data.error || "No se pudo cargar la configuración de IA.");
        }
        return r.json();
      })
      .then((data) => {
        setEnabled(Boolean(data.enabled));
        if (data.config) setConfig({ ...data.config });
        if (data.presets) setPresets(data.presets);
        setDemoFailClosed(Boolean(data.demoPolicy?.productionFailClosed));
        setLoaded(true);
      })
      .catch((err) => {
        setLoadError(
          err instanceof Error
            ? err.message
            : "No se pudo cargar la configuración de IA."
        );
        setLoaded(true);
      });
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

  function configPayload() {
    return {
      preset: config.preset,
      apiUrl: config.apiUrl,
      apiKey: clearApiKey ? null : config.apiKey,
      model: config.model,
      requireApproval: config.requireApproval,
      allowDemo: config.allowDemo,
    };
  }

  async function saveConfig() {
    return apiMutation<{ config?: LlmConfig }>("/api/integrations/llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save-config",
        enabled,
        config: configPayload(),
      }),
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    setOk(false);
    setSaving(true);
    const result = await saveConfig();
    setSaving(false);
    setOk(result.ok);
    setMessage(
      result.ok
        ? "Configuración de IA guardada."
        : result.error || "No se pudo guardar la configuración."
    );
    if (result.ok && result.data.config) {
      setConfig({ ...result.data.config });
      setClearApiKey(false);
    }
  }

  async function onTest() {
    setTesting(true);
    setMessage("");
    setOk(false);
    const saveResult = await saveConfig();
    if (!saveResult.ok) {
      setTesting(false);
      setOk(false);
      setMessage(
        saveResult.error ||
          "No se pudo guardar antes de probar. Corrija el endpoint y vuelva a intentar."
      );
      return;
    }
    if (saveResult.data.config) {
      setConfig({ ...saveResult.data.config });
      setClearApiKey(false);
    }
    const result = await apiMutation<{
      ok?: boolean;
      provider?: string;
      model?: string;
      preview?: string;
      note?: string;
      error?: string;
    }>("/api/integrations/llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "test" }),
    });
    setTesting(false);
    if (!result.ok) {
      setOk(false);
      setMessage(result.error || "La prueba de conexión falló.");
      return;
    }
    const data = result.data;
    setOk(Boolean(data.ok));
    setMessage(
      data.ok
        ? `Conexión correcta · ${data.provider}/${data.model}: ${data.preview}`
        : [data.note, data.error].filter(Boolean).join(" — ") ||
            "La prueba de conexión falló."
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
          Conecte el copiloto a OpenAI, Azure, Groq, Ollama, Hermes Agent u otro
          servicio compatible. Hermes es el preset técnico; en la UI se muestra
          como Copiloto IA. LexOpen usa la ruta{" "}
          <code className="text-xs">{"{url}/chat/completions"}</code> del
          endpoint que indique.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Integración de IA activada
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Proveedor</span>
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
          <span className="mb-1 block font-medium">URL base del endpoint</span>
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
            <code>http://localhost:8642/v1</code> (Hermes).
          </span>
        </label>
        <div className="md:col-span-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">API key</span>
            <input
              className="input"
              type="password"
              value={clearApiKey ? "" : config.apiKey}
              disabled={clearApiKey}
              onChange={(e) => {
                setClearApiKey(false);
                setConfig((c) => ({ ...c, apiKey: e.target.value }));
              }}
              placeholder={
                clearApiKey
                  ? "Se eliminará al guardar"
                  : config.hasApiKey
                    ? "•••• (dejar en blanco para conservar)"
                    : "sk-…"
              }
              autoComplete="off"
            />
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[var(--ink-soft)]/65">
            <span>Opcional en Ollama local. Queda cifrada en este Host.</span>
            {(config.hasApiKey || config.apiKey) && (
              <button
                type="button"
                className="text-[var(--sea)] underline-offset-2 hover:underline"
                onClick={() => {
                  setClearApiKey(true);
                  setConfig((c) => ({ ...c, apiKey: "", hasApiKey: false }));
                }}
              >
                Quitar API key
              </button>
            )}
            {clearApiKey && (
              <button
                type="button"
                className="text-[var(--ink-soft)] underline-offset-2 hover:underline"
                onClick={() => {
                  setClearApiKey(false);
                  setConfig((c) => ({
                    ...c,
                    apiKey: "••••",
                    hasApiKey: true,
                  }));
                }}
              >
                Deshacer
              </button>
            )}
          </div>
        </div>
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
          Permitir respuestas de demostración si el proveedor no responde
        </label>
      </div>
      <p className="text-xs text-[var(--ink-soft)]/60">
        {demoFailClosed
          ? "Este Host está en producción: las respuestas de demostración están bloqueadas hasta que el administrador active LLM_ALLOW_DEMO=1 en el entorno y reinicie."
          : "Si el proveedor no responde, LexOpen puede mostrar una respuesta de demostración marcada como no real."}
      </p>

      {loadError && (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900" role="alert">
          {loadError}
        </p>
      )}

      <div className="rounded-2xl border border-[var(--line)] bg-white/60 p-4 text-xs text-[var(--ink-soft)]/75">
        <p className="font-medium text-[var(--ink)]">
          Equivalente en el archivo de entorno (sigue el formulario)
        </p>
        <p className="mt-1 text-[var(--ink-soft)]/70">
          Al guardar, LexOpen guarda esto en su Host. No hace falta editar el
          entorno salvo que quiera fijar el valor al arrancar.
        </p>
        <pre
          className="mt-2 overflow-x-auto rounded-xl bg-[var(--ink)] p-3 text-[11px] text-white/85"
          data-testid="llm-env-snippet"
        >
          {llmEnvSnippet({
            ...config,
            apiKey: clearApiKey ? "" : config.apiKey,
          })}
        </pre>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" type="submit" disabled={saving || testing}>
          {saving ? "Guardando…" : "Guardar IA"}
        </button>
        <button
          className="btn btn-secondary"
          type="button"
          disabled={testing || saving}
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
