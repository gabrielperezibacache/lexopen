import type { ToolResult } from "@/lib/assistant/types";

export type AltazorProgress = { summary: string; planned: number; completed: number; failed: number };
const activities: Record<string, string> = {
  "respuesta.libre": "analizar las fuentes y preparar una respuesta",
  "icaro.listar": "consultar tus Ícaros disponibles",
  "icaro.delegar": "delegar el análisis a tus Ícaros",
  "escritorio.listar": "consultar los escritorios disponibles",
  "escritorio.leer": "leer el texto del navegador o documento",
  "escritorio.encargar": "enviar el encargo al escritorio",
};
function activity(id: string) {
  if (activities[id]) return activities[id];
  if (id.startsWith("academia.")) return "preparar el trabajo académico";
  if (id.startsWith("audiencia.")) return "preparar la audiencia";
  if (id.startsWith("escrito.")) return "preparar el escrito";
  if (id.startsWith("biblioteca.") || id.startsWith("documento.")) return "consultar los documentos";
  if (id.startsWith("tarea.")) return "organizar las tareas";
  if (id.startsWith("evento.")) return "actualizar la agenda";
  if (id.startsWith("plazo.")) return "revisar los plazos";
  if (id.startsWith("nota.") || id.startsWith("minuta.")) return "preparar las notas de trabajo";
  if (id.startsWith("causa.") || id.startsWith("sincronizacion.")) return "consultar la causa";
  return "atender tu solicitud";
}
export function plannedActionSummary(steps: readonly { toolId: string }[]) {
  const labels = [...new Set(steps.map(step => activity(step.toolId)))];
  if (!labels.length) return "Preparar una respuesta para tu revisión.";
  const visible = labels.slice(0, 3);
  const text = visible.length === 1 ? visible[0] : `${visible.slice(0, -1).join(", ")} y ${visible.at(-1)}`;
  return `Voy a ${text}${labels.length > visible.length ? " y completar las acciones relacionadas" : ""}.`;
}
export function turnProgress(steps: readonly { toolId: string }[], results: readonly { toolId: string; result: ToolResult }[]): AltazorProgress {
  const source = steps.length ? steps : results;
  const pending = new Set(["queued", "running", "pending", "waiting", "awaiting_help", "starting"]);
  return {
    summary: plannedActionSummary(source), planned: source.length,
    completed: results.filter(item => item.result.ok && !pending.has(String(item.result.card?.status || ""))).length,
    failed: results.filter(item => !item.result.ok).length,
  };
}
