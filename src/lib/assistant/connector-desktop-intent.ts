import { normalizeSearch } from "@/lib/search";
import type { AssistantIntent } from "./types";

/** A requested external read becomes a reviewed desktop task, never a fabricated answer. */
export function connectorDesktopIntent(text: string): AssistantIntent | undefined {
  if (!text.trim() || text.trim().length > 4000) return;
  const flat = normalizeSearch(text).trim();
  if (!/^(?:(?:por favor[,\s]+|puedes\s+|podrias\s+|quiero que\s+))*(?:busca|buscar|lee|leer|abre|abrir|lista|listar|muestra|muestrame|mostrar|revisa|revisar|resume|resumir|compara|comparar|analiza|analizar|descarga|descargar|comprueba|comprobar|verifica|verificar)\b/.test(flat)) return;
  if (!/\b(?:google drive|mi drive|en drive|de drive|github|dropbox|onedrive|microsoft\s*365)\b/.test(flat)) return;
  // Asking how to prepare a connection is not a request to use that account.
  if (/\b(?:como|instrucciones para|ayuda para|pasos para|si puedo|si podria|si se puede|si puedes)\s+(?:poder\s+)?(?:conectar|configurar|iniciar sesion|autorizar|vincular)\b/.test(flat)) return;
  return { toolId: "escritorio.encargar", confidence: 1, slots: { texto: text.trim() } };
}
