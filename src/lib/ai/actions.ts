import { extractJson } from "@/lib/ai/parse";

export const AI_ACTIONS = [
  "causa.resumen",
  "causa.sugerir_tramites",
  "causa.extraer",
  "minuta.borrador",
  "documento.resumir",
  "documento.clasificar",
  "plazo.sugerir",
  "jurisprudencia.brief",
  "factura.glosa",
  "mensaje.borrador",
  "wiki.borrador",
] as const;

export type AiActionId = (typeof AI_ACTIONS)[number];

export function isAiActionId(v: string): v is AiActionId {
  return (AI_ACTIONS as readonly string[]).includes(v);
}

export type AiActionMeta = {
  id: AiActionId;
  label: string;
  description: string;
  expectsJson: boolean;
};

export const AI_ACTION_META: Record<AiActionId, AiActionMeta> = {
  "causa.resumen": {
    id: "causa.resumen",
    label: "Resumen procesal",
    description: "Resume la causa y propone próximos pasos.",
    expectsJson: false,
  },
  "causa.sugerir_tramites": {
    id: "causa.sugerir_tramites",
    label: "Sugerir trámites",
    description: "Checklist de trámites pendientes para la causa.",
    expectsJson: true,
  },
  "causa.extraer": {
    id: "causa.extraer",
    label: "Extraer datos de causa",
    description: "RIT, tribunal, partes y materia desde texto libre.",
    expectsJson: true,
  },
  "minuta.borrador": {
    id: "minuta.borrador",
    label: "Borrador de minuta",
    description: "Completa resumen, hechos, acuerdos y acciones.",
    expectsJson: true,
  },
  "documento.resumir": {
    id: "documento.resumir",
    label: "Resumir documento",
    description: "Memo ejecutivo del documento.",
    expectsJson: false,
  },
  "documento.clasificar": {
    id: "documento.clasificar",
    label: "Clasificar documento",
    description: "Sugiere tipo y sensibilidad.",
    expectsJson: true,
  },
  "plazo.sugerir": {
    id: "plazo.sugerir",
    label: "Sugerir plazos",
    description: "Plazos procesales según etapa y materia.",
    expectsJson: true,
  },
  "jurisprudencia.brief": {
    id: "jurisprudencia.brief",
    label: "Brief de jurisprudencia",
    description: "Síntesis aplicable a la consulta o causa.",
    expectsJson: false,
  },
  "factura.glosa": {
    id: "factura.glosa",
    label: "Glosa de factura",
    description: "Redacta glosa profesional para boleta/factura.",
    expectsJson: true,
  },
  "mensaje.borrador": {
    id: "mensaje.borrador",
    label: "Borrador de mensaje",
    description: "Mensaje interno o al cliente.",
    expectsJson: true,
  },
  "wiki.borrador": {
    id: "wiki.borrador",
    label: "Borrador wiki",
    description: "Playbook Markdown para el espacio.",
    expectsJson: true,
  },
};

export function buildActionInstructions(action: AiActionId): string {
  switch (action) {
    case "causa.resumen":
      return `Entrega un resumen procesal en Markdown (español chileno):
## Estado actual
## Hechos clave
## Riesgos
## Próximos 3 pasos
Sé concreto; no inventes RIT ni resoluciones.`;
    case "causa.sugerir_tramites":
      return `Devuelve SOLO JSON:
{"tramites":[{"titulo":"...","detalle":"...","diasLimite":7}]}
Sugiere 4-6 trámites pendientes realistas para un estudio chileno según la causa.`;
    case "causa.extraer":
      return `Del texto del usuario, extrae campos de alta de causa. Devuelve SOLO JSON:
{"titulo":"","rit":null,"ruc":null,"tribunal":"","materia":"civil|laboral|penal|familia|constitucional|otro","caratula":"","resumen":"","partes":[{"nombre":"","rut":null,"rol":"demandante|demandado|recurrente|recorrido"}]}
Usa null si falta dato. materia debe ser uno de esos valores.`;
    case "minuta.borrador":
      return `Redacta borrador de minuta de handoff. Devuelve SOLO JSON:
{"titulo":"","resumenEjecutivo":"","hechosRelevantes":"","acuerdos":"","estadoCausaNota":"","riesgosAlertas":"","acciones":[{"descripcion":"...","prioridad":"alta|media|baja","diasPlazo":5,"crearPlazo":true,"crearTask":true}]}
Máximo 5 acciones. Español formal chileno.`;
    case "documento.resumir":
      return `Resume el documento en Markdown breve:
## Resumen
## Puntos clave
## Acciones sugeridas
Si el extracto es insuficiente, indícalo.`;
    case "documento.clasificar":
      return `Clasifica el documento. Devuelve SOLO JSON:
{"tipo":"escrito|contrato|minuta|evidencia|otro","confidencial":false,"privilegio":false,"etiquetas":["..."],"motivo":"..."}`;
    case "plazo.sugerir":
      return `Sugiere plazos procesales Chile. Devuelve SOLO JSON:
{"plazos":[{"titulo":"...","dias":5,"tipoComputo":"habiles|corridos","esFatal":true,"tipo":"procesal","descripcion":"..."}]}
Máximo 5. Sé prudente con fatales.`;
    case "jurisprudencia.brief":
      return `Elabora un brief en Markdown:
## Hallazgos
## Doctrina útil
## Aplicación a la consulta
## Riesgos de distinción
No inventes roles ni cortes; usa solo el corpus entregado.`;
    case "factura.glosa":
      return `Redacta glosa de boleta/factura chilena. Devuelve SOLO JSON:
{"glosa":"...","notasInternas":"..."}
Glosa clara, profesional, máx 400 caracteres.`;
    case "mensaje.borrador":
      return `Redacta mensaje. Devuelve SOLO JSON:
{"asunto":"...","cuerpo":"..."}
Tono profesional chileno; si destinatario es cliente, evita jerga interna.`;
    case "wiki.borrador":
      return `Borrador de página wiki/playbook. Devuelve SOLO JSON:
{"title":"...","content":"# Markdown..."}
Checklist accionable para el estudio.`;
    default:
      return "Responde en español chileno formal.";
  }
}

export function demoForAction(action: AiActionId, hint = ""): string {
  switch (action) {
    case "causa.sugerir_tramites":
      return JSON.stringify(
        {
          tramites: [
            {
              titulo: "Actualizar etapa procesal",
              detalle: "Registrar último movimiento en LexOpen.",
              diasLimite: 1,
            },
            {
              titulo: "Informar avance al cliente",
              detalle: "Resumen ejecutivo post-actuación.",
              diasLimite: 2,
            },
            {
              titulo: "Calendariar próximo plazo fatal",
              detalle: "Cruzar con CPC/CT según materia.",
              diasLimite: 3,
            },
          ],
        },
        null,
        2
      );
    case "causa.extraer":
      return JSON.stringify(
        {
          titulo: "Cobro de pesos — borrador IA",
          rit: "C-0000-2026",
          ruc: null,
          tribunal: "1º Juzgado Civil de Santiago",
          materia: "civil",
          caratula: "Demandante con Demandado",
          resumen: hint.slice(0, 240) || "Resumen demo generado por LexOpen.",
          partes: [
            { nombre: "Demandante SpA", rut: null, rol: "demandante" },
            { nombre: "Demandado Ltda.", rut: null, rol: "demandado" },
          ],
        },
        null,
        2
      );
    case "minuta.borrador":
      return JSON.stringify(
        {
          titulo: "Minuta post-actuación (demo IA)",
          resumenEjecutivo:
            "Se discutió el estado procesal y se acordaron próximos pasos de tramitación.",
          hechosRelevantes:
            "1) Se revisó el último proveído.\n2) Quedó pendiente acompañar documentos.",
          acuerdos: "Equipo cargará prueba y avisará al cliente esta semana.",
          estadoCausaNota: "Continúa en etapa actual; sin cambio sustancial.",
          riesgosAlertas: "Atención a plazos fatales de días hábiles.",
          acciones: [
            {
              descripcion: "Acompañar documentos pendientes",
              prioridad: "alta",
              diasPlazo: 5,
              crearPlazo: true,
              crearTask: true,
            },
            {
              descripcion: "Informar al cliente",
              prioridad: "media",
              diasPlazo: 2,
              crearPlazo: false,
              crearTask: true,
            },
          ],
        },
        null,
        2
      );
    case "documento.clasificar":
      return JSON.stringify(
        {
          tipo: "escrito",
          confidencial: false,
          privilegio: false,
          etiquetas: ["demo", "ia"],
          motivo: "Clasificación demo sin modelo real.",
        },
        null,
        2
      );
    case "plazo.sugerir":
      return JSON.stringify(
        {
          plazos: [
            {
              titulo: "Plazo para acompañar documentos",
              dias: 5,
              tipoComputo: "habiles",
              esFatal: false,
              tipo: "procesal",
              descripcion: "Sugerencia demo.",
            },
            {
              titulo: "Plazo fatal de contestación",
              dias: 15,
              tipoComputo: "habiles",
              esFatal: true,
              tipo: "procesal",
              descripcion: "Verificar notificación efectiva.",
            },
          ],
        },
        null,
        2
      );
    case "factura.glosa":
      return JSON.stringify(
        {
          glosa:
            "Honorarios profesionales por asesoría y tramitación judicial del período, conforme a encargo.",
          notasInternas: "Glosa demo — revisar antes de emitir.",
        },
        null,
        2
      );
    case "mensaje.borrador":
      return JSON.stringify(
        {
          asunto: "Actualización de su causa",
          cuerpo:
            "Estimado/a:\n\nLe informamos el avance reciente de su asunto. Quedamos atentos a sus comentarios.\n\nSaludos cordiales.",
        },
        null,
        2
      );
    case "wiki.borrador":
      return JSON.stringify(
        {
          title: "Playbook de tramitación (demo)",
          content:
            "# Playbook\n\n## Checklist\n- [ ] Revisar RIT/RUC\n- [ ] Actualizar trámites\n- [ ] Informar cliente\n",
        },
        null,
        2
      );
    case "documento.resumir":
      return `## Resumen (demo)\nDocumento revisado en modo demo.\n\n## Puntos clave\n- Verificar autenticidad y fechas\n- Cruzar con trámites de la causa\n\n## Acciones sugeridas\n- Etiquetar y vincular a la causa\n\n> ${hint.slice(0, 120)}`;
    case "jurisprudencia.brief":
      return `## Hallazgos (demo)\nSíntesis preliminar sobre: ${hint.slice(0, 120) || "la consulta"}\n\n## Doctrina útil\n- Contraste hechos / norma aplicable\n\n## Aplicación\nUse solo fallos del corpus LexOpen.\n\n## Riesgos\nDistinga ratio decidendi de obiter.`;
    case "causa.resumen":
    default:
      return `## Estado actual (demo)\nResumen IA de demostración.\n\n## Hechos clave\n- ${hint.slice(0, 160) || "Sin contexto adicional"}\n\n## Riesgos\nVerificar plazos fatales.\n\n## Próximos 3 pasos\n1. Actualizar trámites\n2. Revisar documentos\n3. Informar al cliente`;
  }
}

export function parseActionResult(action: AiActionId, content: string) {
  const meta = AI_ACTION_META[action];
  if (!meta.expectsJson) {
    return { data: null as null, content };
  }
  const data = extractJson(content);
  return { data, content };
}
