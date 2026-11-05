/**
 * Clasificador por reglas (fallback sin LLM). Español chileno, multi-intent
 * cuando el texto conecta varias peticiones ("y", ";", salto de línea);
 * ambiguo cuando varias reglas distintas calzan sobre una sola petición.
 * Nunca falla en silencio: siempre devuelve al menos `respuesta.libre`.
 */

import { normalizeSearch } from "@/lib/search";
import type { AssistantIntent, AssistantIntentId } from "./types";
import type { NormalizedAssistantInput } from "./normalize";

export type RuleClassifyResult = {
  intents: AssistantIntent[];
  clarify?: string;
};

type Rule = {
  toolId: AssistantIntentId;
  patterns: RegExp[];
};

const RULES: Rule[] = [
  {
    toolId: "nota.crear",
    patterns: [
      /\b(crea|crear|agrega|agregar|anota|anotar|toma)\b[^.]{0,40}\bnota\b/,
      /\bnueva\s+nota\b/,
    ],
  },
  {
    toolId: "nota.editar",
    patterns: [
      /\b(edita|editar|modifica|modificar|actualiza|actualizar|corrige|corregir)\b[^.]{0,40}\bnota\b/,
    ],
  },
  {
    toolId: "tarea.crear",
    patterns: [
      /\b(crea|crear|agrega|agregar|asigna|asignar)\b[^.]{0,40}\btarea\b/,
      /\bnueva\s+tarea\b/,
    ],
  },
  {
    toolId: "tarea.completar",
    patterns: [
      /\b(completa|completar|marca|marcar|cierra|cerrar|termina|terminar)\b[^.]{0,40}\btarea\b/,
    ],
  },
  {
    toolId: "causa.vincular",
    patterns: [
      /\bvincula(r)?\b[^.]{0,40}\bcausa\b/,
      /\bcausa\b[^.]{0,40}\bvincula(r)?\b/,
    ],
  },
  {
    toolId: "causa.resumen",
    patterns: [
      /\bresum(e|ir|en)\b[^.]{0,40}\bcausa\b/,
      /\bque\s+ha\s+pasado\b[^.]{0,40}\bcausa\b/,
    ],
  },
  {
    toolId: "causa.movimientos",
    patterns: [
      /\bmovimientos?\b[^.]{0,40}\bcausa\b/,
      /\bultimos?\s+movimientos\b/,
    ],
  },
  {
    toolId: "causa.estado",
    patterns: [
      /\bestado\b[^.]{0,40}\bcausa\b/,
      /\bcomo\s+va\b[^.]{0,40}\bcausa\b/,
    ],
  },
  {
    toolId: "causa.buscar",
    patterns: [/\bbusca(r)?\b[^.]{0,40}\bcausa\b/, /\bcausa\b[^.]{0,20}\brit\b/],
  },
  {
    toolId: "minuta.borrador",
    patterns: [
      /\bborrador\b[^.]{0,40}\bminuta\b/,
      /\bredacta(r)?\b[^.]{0,40}\bminuta\b/,
    ],
  },
  {
    toolId: "minuta.crear",
    patterns: [
      /\bcrea(r)?\b[^.]{0,40}\bminuta\b/,
      /\bguarda(r)?\b[^.]{0,40}\bminuta\b/,
    ],
  },
  {
    toolId: "documento.buscar",
    patterns: [/\bbusca(r)?\b[^.]{0,40}\bdocumentos?\b/],
  },
  {
    toolId: "documento.descargar",
    patterns: [/\bdescarga(r)?\b[^.]{0,40}\bdocumentos?\b/],
  },
  {
    toolId: "documento.resumir",
    patterns: [/\bresum(e|ir)\b[^.]{0,40}\bdocumentos?\b/],
  },
  {
    toolId: "documento.clasificar",
    patterns: [/\bclasifica(r)?\b[^.]{0,40}\bdocumentos?\b/],
  },
  {
    toolId: "plazo.estimar",
    patterns: [
      /\bestima(r)?\b[^.]{0,40}\bplazo\b/,
      /\bcuando\s+vence\b/,
      /\bcalcula(r)?\b[^.]{0,40}\bvencimiento\b/,
    ],
  },
  {
    toolId: "plazo.crear",
    patterns: [
      /\b(crea|crear|agenda|agendar|registra|registrar)\b[^.]{0,40}\bplazo\b/,
      /\bnuevo\s+plazo\b/,
    ],
  },
  {
    toolId: "evento.eliminar",
    patterns: [
      /\b(elimina|eliminar|cancela|cancelar|borra|borrar)\b[^.]{0,40}\b(evento|audiencia|reunion)\b/,
    ],
  },
  {
    toolId: "evento.editar",
    patterns: [
      /\b(edita|editar|modifica|modificar|reprograma|reprogramar|mueve|mover)\b[^.]{0,40}\b(evento|audiencia|reunion)\b/,
    ],
  },
  {
    toolId: "evento.crear",
    patterns: [
      /\b(agenda|agendar|crea|crear)\b[^.]{0,40}\b(audiencia|reunion|evento|cita)\b/,
    ],
  },
  {
    toolId: "jurisprudencia.brief",
    patterns: [
      /\bbrief\b[^.]{0,40}\bjurisprudencia\b/,
      /\bresume\b[^.]{0,40}\bfallo\b/,
    ],
  },
  {
    toolId: "jurisprudencia.buscar",
    patterns: [
      /\bjurisprudencia\b/,
      /\bbusca(r)?\b[^.]{0,40}\b(fallo|sentencia)\b/,
    ],
  },
  {
    toolId: "buscar",
    patterns: [/\bbusca(r)?\b/],
  },
];

const COMPOUND_HINT = /\by\b|;|\n/;

/** A complete, affirmative read command; never infer a write or an extra action. */
export function explicitDesktopListing(normalized: NormalizedAssistantInput): AssistantIntent | undefined {
  const text = normalizeSearch(normalized.text).replace(/^[¿¡\s]+|[?!\.\s]+$/g, "");
  const match = /^(?:(?:por favor[,\s]+|solo\s*|solamente\s+|unicamente\s+|puedes\s+|podrias\s+))*(?:muestrame|muestra|mostrar|ensename|ensena|lista|listar|consulta|consultar|ver|quiero ver|deseo ver)\s+(?:(?:los|mis)\s+)?(?:escritorios|computadores)((?:\s+(?:activos|abiertos|disponibles)|\s+de\s+(?:altazor(?:\s+ai)?|lexopen)|\s+(?:de|en)\s+(?:este\s+(?:espacio|ambito)|esta\s+causa|mi\s+(?:espacio|cuenta)))*)(?:,?\s+por favor)?$/.exec(text);
  return match ? { toolId: "escritorio.listar", confidence: 1, slots: {} } : undefined;
}
/** Precise navigation reads stay local and never inspect document contents. */
export function explicitWorkflowListing(normalized: NormalizedAssistantInput): AssistantIntent | undefined {
  const text=normalizeSearch(normalized.text).replace(/^[¿¡\s]+|[?!.\s]+$/g,"");
  if(/^(?:(?:muestrame|muestra|consulta|consultar|ver)\s+(?:el\s+)?)?estado de (?:la )?sincronizacion(?: de (?:esta|la) causa)?$/.test(text))return{toolId:"sincronizacion.estado",confidence:1,slots:{}};
  const match=/^(?:(?:por favor[,\s]+|solo\s+|puedes\s+|podrias\s+))*(?:muestrame|muestra|mostrar|lista|listar|consulta|consultar|ver|quiero ver)\s+(?:(?:mi|mis|la|las|los)\s+)?(audiencias|escritos|trabajos academicos|biblioteca)(?:\s+(?:de esta causa|de la causa|privados|guardados|disponibles))?(?:,?\s+por favor)?$/.exec(text);
  const ids:Record<string,AssistantIntentId>={audiencias:"audiencia.listar",escritos:"escrito.listar","trabajos academicos":"academia.listar",biblioteca:"biblioteca.listar"};
  return match?{toolId:ids[match[1]],confidence:1,slots:{}}:undefined;
}

function buildDefaultSlots(
  toolId: AssistantIntentId,
  normalized: NormalizedAssistantInput
): Record<string, unknown> {
  const slots: Record<string, unknown> = { texto: normalized.text };
  if (normalized.rit) slots.rit = normalized.rit;
  if (normalized.ruc) slots.ruc = normalized.ruc;
  if (normalized.dates.length) slots.fecha = normalized.dates[0];
  if (normalized.time) slots.time = normalized.time;
  if (normalized.mentions.length) slots.mentions = normalized.mentions;
  if (toolId === "evento.crear") {
    const flat = normalizeSearch(normalized.text);
    if (/\baudiencia\b/.test(flat)) slots.tipo = "audiencia";
    else if (/\breunion\b/.test(flat)) slots.tipo = "reunion";
    else if (/\brecordatorio\b/.test(flat)) slots.tipo = "recordatorio";
    const tituloMatch = normalized.text.match(
      /\b(?:sobre|de|titulad[oa])\s+(.+)$/i
    );
    if (tituloMatch?.[1]) slots.titulo = tituloMatch[1].trim().slice(0, 200);
    else if (/\baudiencia\b/i.test(normalized.text)) {
      slots.titulo = `Audiencia — ${normalized.text.slice(0, 80)}`;
    }
  }
  return slots;
}

/** Clasificador determinístico sin LLM. Nunca devuelve `intents` vacío. */
export function ruleClassify(
  normalized: NormalizedAssistantInput
): RuleClassifyResult {
  const flat = normalizeSearch(normalized.text);
  const desktopRead = explicitDesktopListing(normalized);
  if (desktopRead) return { intents: [desktopRead] };
  const workflowRead=explicitWorkflowListing(normalized);
  if(workflowRead) return {intents:[workflowRead]};
  if (/^guarda(?:r)?\s+(?:la|esta|tu|ultima)\s+respuesta\s+como\s+(?:un\s+)?(?:borrador\s+de\s+)?escrito\b/.test(flat)) return {intents:[{toolId:"escrito.guardar",confidence:1,slots:{titulo:normalized.text.match(/(?:titulado|llamado)\s+["«]?(.+?)["»]?$/i)?.[1]?.slice(0,200)}}]};
  if (/\b(encarga|encargar|delega|delegar|envia|enviar)\b[^.]{0,100}\b(escritorio|computador)\b/.test(flat)) return { intents: [{ toolId: "escritorio.encargar", confidence: 0.95, slots: { texto: normalized.text } }] };
  const matched: AssistantIntent[] = [];

  for (const rule of RULES) {
    if (rule.toolId === "buscar") continue; // reserva: solo si nada más calza
    if (rule.patterns.some((p) => p.test(flat))) {
      matched.push({
        toolId: rule.toolId,
        confidence: 0.7,
        slots: buildDefaultSlots(rule.toolId, normalized),
      });
    }
  }

  if (matched.length === 0) {
    const buscarRule = RULES.find((r) => r.toolId === "buscar")!;
    if (buscarRule.patterns.some((p) => p.test(flat))) {
      return {
        intents: [
          {
            toolId: "buscar",
            confidence: 0.5,
            slots: { texto: normalized.text, q: normalized.text },
          },
        ],
      };
    }
    return {
      intents: [
        {
          toolId: "respuesta.libre",
          confidence: 0.3,
          slots: { texto: normalized.text },
        },
      ],
    };
  }

  if (matched.length > 1 && !COMPOUND_HINT.test(flat)) {
    return {
      intents: matched,
      clarify: `No estoy seguro de qué acción prefiere (${matched
        .map((m) => m.toolId)
        .join(", ")}). ¿Puede indicar cuál realizar primero?`,
    };
  }

  return { intents: matched };
}
