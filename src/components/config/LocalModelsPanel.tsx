"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiMutation } from "@/lib/api-mutation";
import { LOCAL_MODELS, LOCAL_CONTEXT_TOKENS, type LocalModelId } from "@/lib/integrations/local-model-profiles";
import type { publicLlmConfig } from "@/lib/integrations/llm";
import type { LocalModelHardware, LocalModelRecommendation } from "@/lib/integrations/local-model-hardware";
import styles from "./LocalModelsPanel.module.css";

type Status = {
  runtime: "ready" | "cloud_enabled" | "needs_update" | "unavailable";
  message: string;
  models: { id: LocalModelId; state: "ready" | "missing" | "different" | null }[];
  hardware: LocalModelHardware;
  recommendations: LocalModelRecommendation[];
  installed: { name: string; size: number; catalogId?: LocalModelId; state: "verified" | "unmanaged" }[];
  installedLimited: boolean;
  installedCount: number;
};

type ConnectionView = ReturnType<typeof publicLlmConfig>;
type Action = "download" | "test" | "activate" | "restore";

const endpoint = "/api/integrations/llm/local";
const purposes = { documents: "Revisar documentos", writing: "Redactar y ordenar notas", browser: "Apoyar el uso del navegador y conectores" } as const;
const memoryLabel = (bytes: number) => `${(bytes / 1024 ** 3).toLocaleString("es-CL", { maximumFractionDigits: 1 })} GB`;

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
  const [purpose, setPurpose] = useState<keyof typeof purposes>("documents");
  const [status, setStatus] = useState<Status | null>(null);
  const [checking, setChecking] = useState(true);
  const [checkingError, setCheckingError] = useState("");
  const [action, setAction] = useState<Action | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);
  const operation = useRef<AbortController | null>(null);
  const recommendation = status?.recommendations?.find(item => item.purpose === purpose);
  const profile = LOCAL_MODELS.find((model) => model.id === (selection ?? activeModel ?? recommendation?.candidateId)) ?? LOCAL_MODELS[0];
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
    if (operation.current || disabled) return;
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
    } catch (error) {
      if (controller.signal.aborted) {
        setFeedback({ text: "Solicitud cancelada. Vuelve a detectar los modelos para comprobar su estado.", error: false });
      } else {
        setFeedback({ text: error instanceof Error ? error.message : "No se pudo completar la operación. Vuelve a detectar los modelos e inténtalo de nuevo.", error: true });
      }
    } finally {
      if (operation.current === controller) operation.current = null;
      setAction(null);
      onBusyChange(false);
    }
  }

  function recheck() {
    if (operation.current || disabled) return;
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
        <h2 id="local-ai-title" className="text-lg font-semibold">Modelos de IA local</h2>
        <p className="mt-1 max-w-prose text-sm text-[var(--ink-soft)]">
          Elige un modelo para trabajar con textos en el equipo que aloja LexOpen. Puedes detectar lo que ya está instalado, descargar un modelo y probarlo antes de usarlo.
        </p>
      </div>

      {(checking || status?.message || checkingError) && (
        <p role="status" className="text-sm text-[var(--ink-soft)]">{checking ? "Comprobando Ollama…" : checkingError || status?.message}</p>
      )}

      {status?.hardware && <div className={styles.hardware} aria-label="Equipo detectado">
        <h3>Tu equipo</h3>
        <p>{status.hardware.cpuName} · {status.hardware.cpuCores} núcleos</p>
        <dl>
          <div><dt>Memoria total</dt><dd>{memoryLabel(status.hardware.totalMemoryBytes)}</dd></div>
          <div><dt>Memoria disponible ahora</dt><dd>{memoryLabel(status.hardware.availableMemoryBytes)}</dd></div>
          <div><dt>Espacio de disco de referencia</dt><dd>{status.hardware.diskFreeBytes === null ? "Sin comprobar" : memoryLabel(status.hardware.diskFreeBytes)}</dd></div>
        </dl>
        <details><summary>Acerca de esta detección</summary><p>Corresponde al equipo que aloja LexOpen, aunque te conectes desde otro dispositivo. La memoria disponible cambia con las aplicaciones abiertas. El disco medido puede ser distinto del utilizado por Ollama. La aceleración gráfica no está comprobada.</p></details>
      </div>}

      <div className={styles.recommendation}>
        <label className="block max-w-md text-sm font-medium">Uso principal
          <select className="select w-full" aria-label="Uso principal de la IA local" value={purpose} disabled={Boolean(action) || disabled}
            onChange={event => { setPurpose(event.target.value as keyof typeof purposes); setSelection(undefined); setAcceptedTerms(false); setFeedback(null); }}>
            {Object.entries(purposes).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        {recommendation && <div role="status">
          <p><strong>{recommendation.candidateId ? `Recomendación: ${LOCAL_MODELS.find(item => item.id === recommendation.candidateId)?.name}` : "Sin recomendación para el estado actual del equipo"}</strong></p>
          <p>{recommendation.reason}</p>
          {recommendation.candidateId && profile.id !== recommendation.candidateId && <button className="btn btn-secondary" type="button" disabled={Boolean(action) || disabled} onClick={() => {
            setSelection(recommendation.candidateId ?? undefined); setAcceptedTerms(false); setFeedback(null);
          }}>Seleccionar recomendado</button>}
        </div>}
        <p className="text-sm text-[var(--ink-soft)]">La recomendación es una estimación de recursos. Elegir un modelo no lo descarga ni cambia la conexión activa.</p>
      </div>
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
            <option key={model.id} value={model.id}>{model.name} · {model.download}{model.id === recommendation?.candidateId ? " · Recomendado" : ""}{status?.models.find(item => item.id === model.id)?.state === "ready" ? " · Instalado" : ""}</option>
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
          <button className="btn btn-secondary" type="button" disabled={disabled || checking || Boolean(action)} onClick={recheck}>Detectar equipo y modelos</button>
        )}
        {activeModel && (
          <button className="btn btn-ghost" type="button" disabled={disabled || Boolean(action)} onClick={() => void run("restore")}>
            {action === "restore" ? "Restaurando…" : "Volver a la conexión anterior"}
          </button>
        )}
      </div>
      {status?.runtime === "ready" && <details className={styles.inventory}>
        <summary>Modelos ya instalados · {status.installedCount ?? status.installed?.length ?? 0}</summary>
        {status.installed?.length ? <ul>{status.installed.map(model => <li key={model.name}>
          <div><strong>{model.name}</strong><span>{memoryLabel(model.size)} · {model.state === "verified" ? "Edición reconocida del catálogo" : "Detectado fuera del catálogo gestionado"}</span></div>
          {model.catalogId && <button className="btn btn-secondary" type="button" disabled={disabled || Boolean(action)} onClick={() => {
            setSelection(model.catalogId); setAcceptedTerms(false); setFeedback(null);
          }}>Seleccionar</button>}
        </li>)}</ul> : <p>No se encontraron modelos instalados en Ollama.</p>}
        {status.installedLimited && <p>Se muestran los primeros cien modelos reconocidos. Ollama conserva el inventario completo.</p>}
        <p>Los modelos fuera del catálogo se reconocen, pero no se activan automáticamente. Puedes configurarlos desde la conexión avanzada de IA{activeModel ? ", después de volver a la conexión anterior" : ""}.</p>
      </details>}
      <p className="max-w-prose text-sm text-[var(--ink-soft)]">
        Los modelos de este catálogo trabajan con texto. El perfil reserva una ventana de {LOCAL_CONTEXT_TOKENS.toLocaleString("es-CL")} tokens. OCR, audio y acciones en aplicaciones utilizan sus propias herramientas; la selección del modelo no las instala ni les concede permisos.
      </p>
      {feedback && <p role={feedback.error ? "alert" : "status"} className="text-sm text-[var(--ink)]">{feedback.text}</p>}
    </section>
  );
}
