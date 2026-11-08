"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiMutation } from "@/lib/api-mutation";
import { LOCAL_MODELS, LOCAL_MODELS_BY_MEMORY, LOCAL_MEMORY_CAPACITIES, LOCAL_CONTEXT_TOKENS, localModelsForMemory, localModelSource, type LocalModelId, type LocalMemoryKind } from "@/lib/integrations/local-model-profiles";
import type { publicLlmConfig } from "@/lib/integrations/llm";
import type { LocalModelHardware, LocalModelRecommendation } from "@/lib/integrations/local-model-hardware";
import styles from "./LocalModelsPanel.module.css";

type Status = {
  runtime: "ready" | "cloud_enabled" | "needs_update" | "unavailable";
  message: string;
  models: { id: LocalModelId; state: "ready" | "missing" | "different" | null }[];
  hardware: LocalModelHardware;
  recommendation: LocalModelRecommendation;
  installed: { name: string; size: number; catalogId?: LocalModelId; state: "verified" | "unmanaged" }[];
  installedLimited: boolean;
  installedCount: number;
};

type ConnectionView = ReturnType<typeof publicLlmConfig>;
type Action = "download" | "test" | "activate" | "restore";

const endpoint = "/api/integrations/llm/local";
const memoryKinds = { ram: "RAM · sin GPU dedicada", vram: "VRAM · GPU dedicada", unified: "Memoria unificada" } as const;
const memoryLabel = (bytes: number) => `${(bytes / 1024 ** 3).toLocaleString("es-CL", { maximumFractionDigits: 1 })} GiB`;

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
  const [memoryKind, setMemoryKind] = useState<LocalMemoryKind | "auto">("auto");
  const [capacity, setCapacity] = useState("auto");
  const [status, setStatus] = useState<Status | null>(null);
  const [checking, setChecking] = useState(true);
  const [checkingError, setCheckingError] = useState("");
  const [action, setAction] = useState<Action | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);
  const operation = useRef<AbortController | null>(null);
  const recommendation = status?.recommendation;
  const recommendedId = recommendation?.candidateId ?? recommendation?.capacityCandidateId;
  const detectedKind = recommendation?.basis ?? (status?.hardware?.memoryKind === "unified" ? "unified" : "ram");
  const effectiveKind = memoryKind === "auto" ? detectedKind : memoryKind;
  const detectedCapacity = memoryKind === "auto" && recommendation?.memoryCapacityBytes ? recommendation.memoryCapacityBytes
    : effectiveKind === "unified" ? status?.hardware?.unifiedMemoryBytes
    : effectiveKind === "vram" ? Math.max(0, ...(status?.hardware?.gpus ?? []).filter(gpu => gpu.memoryKind === "dedicated").map(gpu => gpu.totalMemoryBytes ?? 0))
    : status?.hardware?.totalMemoryBytes;
  const capacityGiB = capacity === "auto" ? detectedCapacity ? detectedCapacity / 1024 ** 3 : null : capacity ? Number(capacity) : null;
  const catalog = capacityGiB === null ? LOCAL_MODELS_BY_MEMORY : localModelsForMemory(effectiveKind, capacityGiB);
  const profile = LOCAL_MODELS.find((model) => model.id === (selection ?? activeModel ?? recommendedId)) ?? LOCAL_MODELS[0];
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
        <h2 id="local-ai-title" className="text-lg font-semibold">Modelos de IA locales</h2>
        <p className="mt-1 max-w-prose text-sm text-[var(--ink-soft)]">
          Compara modelos en una sola lista, según la memoria de tu equipo. Prioriza aprovechar el hardware que ya tienes: puedes explorar y elegir sin descargar ni cambiar la conexión activa.
        </p>
      </div>

      {(checking || status?.message || checkingError) && (
        <p role="status" className="text-sm text-[var(--ink-soft)]">{checking ? "Detectando memoria, GPU y modelos…" : checkingError || status?.message}</p>
      )}

      {status?.hardware && <div className={styles.hardware} aria-label="Equipo detectado">
        <h3>Equipo detectado automáticamente</h3>
        <p>{status.hardware.cpuName} · {status.hardware.cpuCores} núcleos</p>
        <dl>
          <div><dt>{status.hardware.memoryKind === "unified" ? "Memoria unificada total" : "RAM total"}</dt><dd>{memoryLabel(status.hardware.totalMemoryBytes)}</dd></div>
          <div><dt>Memoria disponible estimada</dt><dd>{memoryLabel(status.hardware.availableMemoryBytes)}</dd></div>
          <div><dt>Espacio de disco de referencia</dt><dd>{status.hardware.diskFreeBytes === null ? "Sin comprobar" : memoryLabel(status.hardware.diskFreeBytes)}</dd></div>
        </dl>
        {status.hardware.gpus?.length ? <ul className={styles.devices}>{status.hardware.gpus.map((gpu, index) => <li key={`${index}-${gpu.name}`}>
          <strong>{gpu.name}</strong>
          {gpu.memoryKind === "unified" ? <p>CPU y GPU utilizan la misma memoria unificada indicada arriba.</p>
            : gpu.memoryKind === "shared" ? <p>Memoria gráfica compartida; se conserva la referencia de RAM sin sumarla como VRAM.</p>
            : <p>VRAM total: {gpu.totalMemoryBytes === null ? "Sin comprobar" : memoryLabel(gpu.totalMemoryBytes)} · VRAM libre: {gpu.availableMemoryBytes === null ? "Sin comprobar" : memoryLabel(gpu.availableMemoryBytes)}</p>}
        </li>)}</ul> : <p>GPU sin comprobar. Se utiliza la memoria del sistema como referencia.</p>}
        <details><summary>Acerca de esta detección</summary><p>Corresponde al equipo que aloja LexOpen y ejecuta los modelos, aunque te conectes desde otro dispositivo. Las consultas del sistema son de solo lectura: no descargan, instalan ni activan modelos. La memoria disponible incluye una estimación del sistema y cambia con las aplicaciones abiertas. Identificar una GPU no comprueba que el motor pueda utilizarla. El disco medido puede ser distinto del utilizado por Ollama.</p></details>
      </div>}

      <div className={styles.recommendation}>
        {recommendation && <div role="status">
          <p><strong>{recommendedId ? `Recomendación para documentos: ${LOCAL_MODELS.find(item => item.id === recommendedId)?.name}` : "Sin recomendación para el estado actual del equipo"}</strong></p>
          <p>{recommendation.reason}</p>
          {recommendation.candidateId && recommendation.capacityCandidateId && recommendation.capacityCandidateId !== recommendation.candidateId && <p>Con más memoria libre, la capacidad total permite comparar {LOCAL_MODELS.find(item => item.id === recommendation.capacityCandidateId)?.name}. La recomendación actual contempla las aplicaciones abiertas.</p>}
          {recommendedId && profile.id !== recommendedId && <button className="btn btn-secondary" type="button" disabled={Boolean(action) || disabled} onClick={() => {
            setSelection(recommendedId); setAcceptedTerms(false); setFeedback(null);
          }}>Seleccionar recomendado</button>}
        </div>}
        <p className="text-sm text-[var(--ink-soft)]">La recomendación es una estimación de recursos. Elegir un modelo no lo descarga ni cambia la conexión activa.</p>
      </div>

      <div className={styles.catalog}>
        <h3>Opciones según tu memoria</h3>
        <p>Estimaciones para una solicitud de texto con {LOCAL_CONTEXT_TOKENS.toLocaleString("es-CL")} tokens de contexto. RAM y memoria unificada incluyen margen para el sistema. La VRAM es la capacidad de una GPU compatible; requiere también RAM del sistema.</p>
        <div className={styles.filters}>
          <label>Tipo de memoria
            <select className="select w-full" value={memoryKind} disabled={Boolean(action) || disabled} onChange={event => setMemoryKind(event.target.value as LocalMemoryKind | "auto")}>
              <option value="auto">Detección automática</option>
              {Object.entries(memoryKinds).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          <label>Capacidad del equipo
            <select className="select w-full" value={capacity} disabled={Boolean(action) || disabled} onChange={event => setCapacity(event.target.value)}>
              <option value="auto">{detectedCapacity ? `Detectada: ${memoryLabel(detectedCapacity)}` : "Capacidad sin comprobar"}</option>
              <option value="">Ver todas las capacidades</option>
              {LOCAL_MEMORY_CAPACITIES.map(value => <option key={value} value={value}>{value} GB</option>)}
            </select>
          </label>
        </div>
        <p>{memoryKind === "auto" ? `Referencia automática: ${memoryKinds[effectiveKind]}.` : "Estás comparando una referencia manual."} Puedes cambiar los filtros sin alterar la recomendación ni la conexión activa. RAM, VRAM y memoria unificada no se suman; cada GPU se evalúa por separado.</p>
        <div className={styles.tableScroll} role="region" aria-label="Comparación de modelos por memoria" tabIndex={0}>
          <table>
            <caption>{catalog.length} de {LOCAL_MODELS.length} modelos · memoria orientativa en GB · descarga en GB decimales</caption>
            <thead><tr><th scope="col">Modelo y edición</th><th scope="col">Descarga</th><th scope="col">RAM</th><th scope="col">VRAM</th><th scope="col">Unificada</th><th scope="col"><span className="sr-only">Seleccionar modelo</span></th></tr></thead>
            <tbody>{catalog.map(model => <tr key={model.id} aria-selected={profile.id === model.id}>
              <th scope="row"><a href={localModelSource(model)} target="_blank" rel="noreferrer">{model.name}</a><span>{model.tag.split(":")[1]}</span>{model.id === recommendedId && <span>Recomendado para documentos</span>}</th>
              <td><span className={styles.mobileLabel} aria-hidden="true">Descarga</span>{model.download}</td><td><span className={styles.mobileLabel} aria-hidden="true">RAM</span>{model.memory.ram} GB</td><td><span className={styles.mobileLabel} aria-hidden="true">VRAM</span>{model.memory.vram} GB</td><td><span className={styles.mobileLabel} aria-hidden="true">Unificada</span>{model.memory.unified} GB</td>
              <td><button type="button" className="btn btn-secondary" aria-label={`Elegir ${model.name}`} aria-pressed={profile.id === model.id} disabled={Boolean(action) || disabled} onClick={() => { setSelection(model.id); setAcceptedTerms(false); setFeedback(null); }}>{profile.id === model.id ? "Elegido" : "Elegir"}</button></td>
            </tr>)}</tbody>
          </table>
        </div>
        {!catalog.length && <p role="status">No hay modelos con ese margen orientativo. Prueba con otra capacidad.</p>}
        <details><summary>Cómo elegir con menos gasto</summary>
          <p>Para documentos, empieza comparando Qwen3.5 2B en equipos de 8 GB, Qwen3.5 4B en 12–16 GB, Qwen3.5 9B en 16–24 GB y Gemma 4 12B desde 24 GB. Con 32 GB o más puedes comparar Gemma 4 26B A4B o Qwen3.8 27B, dejando más margen si necesitas contexto largo. Son orientaciones de memoria, sin una evaluación comparativa en español jurídico.</p>
          <p>Los modelos mayores son alternativas para hardware disponible; más tamaño no garantiza una respuesta mejor. LexOpen trabaja actualmente con pasajes acotados: el contexto máximo anunciado por un modelo no es la longitud que utiliza esta integración.</p>
          <p>Estos modelos se ejecutan sin tarifa por token del proveedor; siguen existiendo consumo eléctrico, almacenamiento y condiciones de licencia. CPU permite evitar la compra de GPU, con respuestas más lentas. La velocidad debe medirse en el equipo real.</p>
          <p>La cuantización reduce el tamaño de los pesos. Los modelos de expertos también cargan los pesos completos. Más contexto, varias solicitudes o imágenes aumentan la memoria necesaria.</p>
          <p><a href="https://docs.ollama.com/context-length" target="_blank" rel="noreferrer">Contexto y memoria en Ollama</a> · <a href="https://docs.ollama.com/gpu" target="_blank" rel="noreferrer">Compatibilidad de GPU</a> · <a href="https://ai.google.dev/gemma/docs/core" target="_blank" rel="noreferrer">Memoria de Gemma</a></p>
        </details>
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
          {LOCAL_MODELS_BY_MEMORY.map((model) => (
            <option key={model.id} value={model.id}>{model.name} · {model.download}{model.id === recommendation?.candidateId ? " · Recomendado" : ""}{status?.models.find(item => item.id === model.id)?.state === "ready" ? " · Instalado" : ""}</option>
          ))}
        </select>
      </label>
      <div className={styles.selectedModel}>
        <p>{profile.summary}</p>
        <p>Referencia: {profile.memory.ram} GB de RAM · {profile.memory.vram} GB de VRAM · {profile.memory.unified} GB de memoria unificada.</p>
        <p><a href={localModelSource(profile)} target="_blank" rel="noreferrer">Ficha oficial, edición y licencia de {profile.name}</a></p>
      </div>
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
