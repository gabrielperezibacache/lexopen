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

export type MinutaAccionInput = {
  descripcion: string;
  responsable?: string;
  fechaLimite?: string | null;
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
    typeof input.fecha === "string" ? new Date(input.fecha) : input.fecha;
  const fechaStr = Number.isNaN(fecha.getTime())
    ? String(input.fecha)
    : fecha.toISOString().slice(0, 16).replace("T", " ");

  const accionesBlock =
    input.acciones && input.acciones.length > 0
      ? input.acciones
          .map((a, i) => {
            const due =
              a.fechaLimite == null
                ? "sin plazo"
                : typeof a.fechaLimite === "string"
                  ? a.fechaLimite.slice(0, 10)
                  : a.fechaLimite.toISOString().slice(0, 10);
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
