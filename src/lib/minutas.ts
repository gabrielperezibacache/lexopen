export const TIPOS_MINUTA = [
  { value: "audiencia", label: "Audiencia", hint: "Tribunal, junta o acto procesal" },
  { value: "reunion", label: "Reunión", hint: "Cliente, contraparte o equipo" },
  { value: "llamada", label: "Llamada", hint: "Teléfono o videollamada breve" },
] as const;

export const MODALIDADES_MINUTA = [
  { value: "presencial", label: "Presencial" },
  { value: "videollamada", label: "Videollamada" },
  { value: "telefonica", label: "Telefónica" },
  { value: "hibrida", label: "Híbrida" },
] as const;

export const PRIORIDADES_ACCION = [
  { value: "baja", label: "Baja" },
  { value: "media", label: "Media" },
  { value: "alta", label: "Alta" },
  { value: "urgente", label: "Urgente" },
] as const;

export const ESTADOS_ACCION = [
  { value: "pendiente", label: "Pendiente" },
  { value: "en_curso", label: "En curso" },
  { value: "hecha", label: "Hecha" },
  { value: "cancelada", label: "Cancelada" },
] as const;

export const ACCIONES_ABIERTAS = ["pendiente", "en_curso"] as const;

export type MinutaAccionInput = {
  descripcion: string;
  responsable?: string;
  fechaLimite?: string | null;
  diasPlazo?: number | null;
  tipoComputo?: "habiles" | "corridos";
  esFatal?: boolean;
  prioridad?: string;
  crearPlazo?: boolean;
  crearTask?: boolean;
};

export function labelTipoMinuta(value: string) {
  return TIPOS_MINUTA.find((t) => t.value === value)?.label ?? value;
}

export function labelModalidadMinuta(value: string) {
  return MODALIDADES_MINUTA.find((t) => t.value === value)?.label ?? value;
}

export function isValidTipoMinuta(value: string) {
  return TIPOS_MINUTA.some((t) => t.value === value);
}

export function isValidModalidad(value: string) {
  return MODALIDADES_MINUTA.some((t) => t.value === value);
}

export function isValidPrioridad(value: string) {
  return PRIORIDADES_ACCION.some((t) => t.value === value);
}

export function isValidEstadoAccion(value: string) {
  return ESTADOS_ACCION.some((t) => t.value === value);
}

/**
 * Parsea fecha/hora evitando el bug UTC de `YYYY-MM-DD` (medianoche UTC =
 * día anterior en Chile). Fechas solo-día se interpretan como mediodía local.
 */
export function parseLocalDateInput(value?: string | null): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split("-").map(Number);
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  }

  // datetime-local: YYYY-MM-DDTHH:mm
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)) {
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatLocalDate(value?: Date | string | null): string {
  if (value == null) return "—";
  const d = typeof value === "string" ? parseLocalDateInput(value) || new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatLocalDateTime(value?: Date | string | null): string {
  if (value == null) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

export function mapPrioridadToTask(prioridad?: string) {
  if (prioridad === "urgente") return "urgent";
  if (prioridad === "alta") return "high";
  if (prioridad === "baja") return "low";
  return "medium";
}

/** Genera Markdown listo para documento / Drive / Obsidian. */
export function renderMinutaMarkdown(input: {
  tipo: string;
  titulo: string;
  fecha: Date | string;
  modalidad?: string | null;
  lugar?: string | null;
  participantes?: string | null;
  resumenEjecutivo: string;
  hechosRelevantes?: string | null;
  acuerdos?: string | null;
  proximosPasos?: string | null;
  riesgosAlertas?: string | null;
  estadoCausaNota?: string | null;
  causa: {
    titulo: string;
    rit?: string | null;
    tribunal?: string | null;
    etapa?: string | null;
    caratula?: string | null;
  };
  autorName?: string | null;
  acciones?: Array<{
    descripcion: string;
    responsable?: string | null;
    fechaLimite?: Date | string | null;
    prioridad?: string | null;
  }>;
}) {
  const fecha =
    typeof input.fecha === "string"
      ? parseLocalDateInput(input.fecha) || new Date(input.fecha)
      : input.fecha;
  const fechaStr = Number.isNaN(fecha.getTime())
    ? String(input.fecha)
    : formatLocalDateTime(fecha);

  const accionesBlock =
    input.acciones && input.acciones.length > 0
      ? input.acciones
          .map((a, i) => {
            const due =
              a.fechaLimite == null
                ? "sin plazo"
                : formatLocalDate(a.fechaLimite);
            return `${i + 1}. **${a.descripcion}** — ${a.responsable || "sin asignar"} · ${due} · prioridad ${a.prioridad || "media"}`;
          })
          .join("\n")
      : input.proximosPasos || "_Sin acciones registradas_";

  return `# Minuta — ${labelTipoMinuta(input.tipo)}

**${input.titulo}**

| Campo | Detalle |
| --- | --- |
| Causa | ${input.causa.titulo} |
| RIT | ${input.causa.rit || "—"} |
| Tribunal | ${input.causa.tribunal || "—"} |
| Carátula | ${input.causa.caratula || "—"} |
| Etapa | ${input.causa.etapa || "—"} |
| Fecha | ${fechaStr} |
| Modalidad | ${labelModalidadMinuta(input.modalidad || "presencial")} |
| Lugar | ${input.lugar || "—"} |
| Participantes | ${input.participantes || "—"} |
| Autor | ${input.autorName || "—"} |

## Resumen ejecutivo
${input.resumenEjecutivo}

## Hechos relevantes
${input.hechosRelevantes || "_No registrados_"}

## Acuerdos / resoluciones
${input.acuerdos || "_No registrados_"}

## Estado de la causa tras el acto
${input.estadoCausaNota || "_Sin cambios anotados_"}

## Próximos pasos (handoff)
${accionesBlock}

## Riesgos y alertas
${input.riesgosAlertas || "_Ninguno_"}

---
_Minuta LexOpen — cualquier abogado del estudio puede continuar la tramitación con esta ficha._
`;
}
