"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiMutation } from "@/lib/api-mutation";
import { LOCAL_MODELS, LOCAL_CONTEXT_TOKENS, type LocalModelId } from "@/lib/integrations/local-model-profiles";
import type { publicLlmConfig } from "@/lib/integrations/llm";

type Status = {
  runtime: "ready" | "cloud_enabled" | "needs_update" | "unavailable";
  message: string;
  models: { id: LocalModelId; state: "ready" | "missing" | "different" | null }[];
};

type ConnectionView = ReturnType<typeof publicLlmConfig>;
type Action = "download" | "test" | "activate" | "restore";

const endpoint = "/api/integrations/llm/local";

async function checkLocalModels(signal: AbortSignal): Promise<Status> {
  const response = await fetch(endpoint, { signal, cache: "no-store" });
  if (!response.ok) throw new Error("No se pudo comprobar la IA local.");
  return response.json();
}

export function LocalModelsPanel({
  activeModel, onConnectionChanged, onBusyChange, disabled,
}: {
  activeModel?: LocalModelId;
  onConnectionChanged: (config: ConnectionView, enabled: boolean) => void;
  onBusyChange: (busy: boolean) => void;
  disabled: boolean;
}) {
  const [selection, setSelection] = useState<LocalModelId | undefined>();
  const [status, setStatus] = useState<Status | null>(null);
  const [checking, setChecking] = useState(true);
  const [checkingError, setCheckingError] = useState("");
  const [action, setAction] = useState<Action | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);
  const operation = useRef<AbortController | null>(null);
  const profile = LOCAL_MODELS.find((model) => model.id === (selection ?? activeModel)) ?? LOCAL_MODELS[0];
  const state = status?.models.find((model) => model.id === profile.id)?.state;
  const active = activeModel === profile.id;

  const refresh = useCallback((signal: AbortSignal) => checkLocalModels(signal)
    .then((next) => {
      if (signal.aborted) return;
      setStatus(next);
      setCheckingError("");
    })
    .catch(() => {
      if (signal.aborted) return;
      setStatus(null);
      setCheckingError("No se pudo comprobar la IA local. Vuelve a intentarlo.");
    })
    .finally(() => {
      if (!signal.aborted) setChecking(false);
    }), []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => {
      controller.abort();
      operation.current?.abort();
    };
  }, [refresh]);

  async function run(next: Action) {
    const controller = new AbortController();
    operation.current = controller;
    onBusyChange(true);
    setAction(next);
    setFeedback(null);
    try {
      const input = next === "restore" ? { action: next }
        : next === "download" ? { action: next, model: profile.id, confirmed: true, acceptedTerms }
        : { action: next, model: profile.id };
      const result = await apiMutation<{ config?: ConnectionView; enabled?: boolean }>(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        setFeedback({ text: "Se canceló la solicitud de descarga. Puedes retomarla al volver a comprobar.", error: false });
        return;
      }
      if (!result.ok) {
        setFeedback({ text: result.error, error: true });
        return;
      }
      if (result.data.config) onConnectionChanged(result.data.config, result.data.enabled ?? true);
      setFeedback({
        text: next === "download" ? "Descarga verificada. Ya puedes probar y usar el modelo."
          : next === "activate" ? "Modelo probado y activado para la IA del estudio."
          : next === "restore" ? "Se restauró la conexión anterior del estudio."
          : "El modelo respondió a la prueba local.",
        error: false,
      });
      if (next === "download") await refresh(controller.signal);
    } finally {
      if (operation.current === controller) operation.current = null;
      setAction(null);
      onBusyChange(false);
    }
  }

  function recheck() {
    const controller = new AbortController();
    operation.current = controller;
    setChecking(true);
    setFeedback(null);
    void refresh(controller.signal).finally(() => {
      if (operation.current === controller) operation.current = null;
    });
  }

  return (
    <section className="panel space-y-4 rounded-3xl p-5 md:p-6" aria-labelledby="local-ai-title" aria-busy={checking || Boolean(action)}>
      <div>
        <h2 id="local-ai-title" className="text-lg font-semibold">IA local</h2>
        <p className="mt-1 max-w-prose text-sm text-[var(--ink-soft)]">
          Usa Ollama en el equipo que aloja LexOpen para tareas breves. El tamaño que se muestra corresponde a la descarga. La memoria de trabajo depende del equipo.
        </p>
      </div>

      {(checking || status?.message || checkingError) && (
        <p role="status" className="text-sm text-[var(--ink-soft)]">{checking ? "Comprobando Ollama…" : checkingError || status?.message}</p>
      )}
      {status && status.runtime !== "ready" && (
        <div className="flex flex-wrap gap-2">
          <a className="btn btn-secondary" href={status.runtime === "cloud_enabled" ? "https://docs.ollama.com/faq#how-do-i-disable-ollamas-cloud-features" : "https://ollama.com/download"} target="_blank" rel="noreferrer">
            {status.runtime === "cloud_enabled" ? "Configurar el modo local" : "Obtener Ollama"}
          </a>
        </div>
      )}

      <label className="block max-w-md text-sm font-medium">
        <span className="mb-1 block">Modelo local</span>
        <select
          className="select w-full"
          value={profile.id}
          disabled={Boolean(action) || disabled}
          onChange={(event) => {
            setSelection(event.target.value as LocalModelId);
            setAcceptedTerms(false);
            setFeedback(null);
          }}
        >
          {LOCAL_MODELS.map((model) => (
            <option key={model.id} value={model.id}>{model.name} · {model.download}{model.id === "qwen-small" ? " · Recomendado" : ""}</option>
          ))}
        </select>
      </label>
      <p className="max-w-prose text-sm text-[var(--ink-soft)]">{profile.task}</p>
      {state === "different" && <p role="status" className="text-sm text-[var(--ink-soft)]">La edición instalada es distinta de la verificada. Elige otro modelo del catálogo.</p>}
      {state === "ready" && <p className="text-sm text-[var(--ink-soft)]">{active ? "Modelo activo para el estudio." : "Modelo instalado y verificado."}</p>}
      {state === "missing" && profile.licenseUrl && (
        <label className="flex min-h-11 max-w-prose items-center gap-3 text-sm">
          <input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} disabled={Boolean(action) || disabled} />
          <span>Acepto los <a className="text-[var(--sea)] underline underline-offset-2" href={profile.licenseUrl} target="_blank" rel="noreferrer">términos de uso de Gemma</a>.</span>
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        {state === "missing" && (
          <button className="btn btn-primary" type="button" disabled={disabled || checking || Boolean(action) || Boolean(profile.licenseUrl && !acceptedTerms)} onClick={() => void run("download")}>
            {action === "download" ? "Descargando…" : `Descargar · ${profile.download}`}
          </button>
        )}
        {state === "ready" && (
          <button className="btn btn-primary" type="button" disabled={disabled || checking || Boolean(action)} onClick={() => void run(active ? "test" : "activate")}>
            {action === "test" || action === "activate" ? "Probando el modelo…" : active ? "Probar el modelo" : "Probar y usar en el estudio"}
          </button>
        )}
        {action === "download" ? (
          <button className="btn btn-secondary" type="button" onClick={() => operation.current?.abort()}>Cancelar descarga</button>
        ) : (
          <button className="btn btn-secondary" type="button" disabled={disabled || checking || Boolean(action)} onClick={recheck}>Comprobar Ollama</button>
        )}
        {activeModel && (
          <button className="btn btn-ghost" type="button" disabled={disabled || Boolean(action)} onClick={() => void run("restore")}>
            {action === "restore" ? "Restaurando…" : "Volver a la conexión anterior"}
          </button>
        )}
      </div>
      <p className="max-w-prose text-sm text-[var(--ink-soft)]">
        El perfil reserva una ventana de {LOCAL_CONTEXT_TOKENS.toLocaleString("es-CL")} tokens para texto y contexto. Las conclusiones y citas requieren revisión.
      </p>
      {feedback && <p role={feedback.error ? "alert" : "status"} className="text-sm text-[var(--ink)]">{feedback.text}</p>}
    </section>
  );
}
