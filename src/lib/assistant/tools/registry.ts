import type { AssistantIntentId } from "@/lib/assistant/types";
import { ASSISTANT_TOOL_IDS } from "@/lib/assistant/types";
import type { AnyAssistantTool } from "./types";
import { notaCrearTool, notaEditarTool } from "./nota";
import { tareaCrearTool, tareaCompletarTool } from "./tarea";
import {
  causaVincularTool,
  causaBuscarTool,
  causaResumenTool,
  causaMovimientosTool,
  causaEstadoTool,
} from "./causa";
import { minutaBorradorTool, minutaCrearTool } from "./minuta";
import {
  documentoBuscarTool,
  documentoDescargarTool,
  documentoResumirTool,
  documentoClasificarTool,
} from "./documento";
import { plazoCrearTool, plazoEstimarTool } from "./plazo";
import { eventoCrearTool, eventoEditarTool, eventoEliminarTool } from "./evento";
import { buscarTool } from "./buscar";
import { jurisprudenciaBuscarTool, jurisprudenciaBriefTool } from "./jurisprudencia";
import { respuestaLibreTool } from "./respuesta-libre";
import { escritorioListarTool, escritorioEncargarTool } from "./escritorio";
import { academiaListarTool, academiaCrearTool, academiaPrepararTool } from "./academic";
import { audienciaListarTool, audienciaCrearTool, audienciaNotaTool, escritoListarTool, escritoGuardarTool } from "./workflow";
import { bibliotecaListarTool, sincronizacionEstadoTool } from "./library-sync";
import { driveEstadoTool, driveCrearCarpetaTool, driveGuardarDocumentoTool } from "./drive";

export const TOOLS: Record<AssistantIntentId, AnyAssistantTool> = {
  "nota.crear": notaCrearTool,
  "nota.editar": notaEditarTool,
  "tarea.crear": tareaCrearTool,
  "tarea.completar": tareaCompletarTool,
  "causa.vincular": causaVincularTool,
  "causa.buscar": causaBuscarTool,
  "causa.resumen": causaResumenTool,
  "causa.movimientos": causaMovimientosTool,
  "causa.estado": causaEstadoTool,
  "minuta.borrador": minutaBorradorTool,
  "minuta.crear": minutaCrearTool,
  "documento.buscar": documentoBuscarTool,
  "documento.descargar": documentoDescargarTool,
  "documento.resumir": documentoResumirTool,
  "documento.clasificar": documentoClasificarTool,
  "plazo.crear": plazoCrearTool,
  "plazo.estimar": plazoEstimarTool,
  "evento.crear": eventoCrearTool,
  "evento.editar": eventoEditarTool,
  "evento.eliminar": eventoEliminarTool,
  buscar: buscarTool,
  "jurisprudencia.buscar": jurisprudenciaBuscarTool,
  "jurisprudencia.brief": jurisprudenciaBriefTool,
  "respuesta.libre": respuestaLibreTool,
  "escritorio.listar": escritorioListarTool,
  "escritorio.encargar": escritorioEncargarTool,
  "academia.listar": academiaListarTool,
  "academia.crear": academiaCrearTool,
  "academia.preparar": academiaPrepararTool,
  "audiencia.listar": audienciaListarTool,
  "audiencia.crear": audienciaCrearTool,
  "audiencia.nota": audienciaNotaTool,
  "escrito.listar": escritoListarTool,
  "escrito.guardar": escritoGuardarTool,
  "biblioteca.listar": bibliotecaListarTool,
  "sincronizacion.estado": sincronizacionEstadoTool,
  "drive.estado": driveEstadoTool,
  "drive.crearCarpeta": driveCrearCarpetaTool,
  "drive.guardarDocumento": driveGuardarDocumentoTool,
};

// Sanity check en tiempo de carga: todo AssistantIntentId debe tener tool.
for (const id of ASSISTANT_TOOL_IDS) {
  if (!TOOLS[id]) {
    throw new Error(`[assistant] falta registrar la herramienta "${id}"`);
  }
}

export function getTool(id: AssistantIntentId): AnyAssistantTool {
  const tool = TOOLS[id];
  if (!tool) throw new Error(`Herramienta desconocida: ${id}`);
  return tool;
}

export function listToolsForRole(role: string): AnyAssistantTool[] {
  return Object.values(TOOLS).filter((tool) => tool.roles.some((r) => r === role));
}
