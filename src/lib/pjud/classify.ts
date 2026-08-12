export type MovimientoTipo =
  | "proveido"
  | "resolucion"
  | "audiencia"
  | "escrito"
  | "notificacion"
  | "plazo"
  | "otro";

const RULES: Array<{ tipo: MovimientoTipo; relevante: boolean; re: RegExp }> = [
  {
    tipo: "audiencia",
    relevante: true,
    re: /\b(audiencia|citaci[oó]n|comparendo|juicio oral|preparatoria)\b/i,
  },
  {
    tipo: "notificacion",
    relevante: true,
    re: /\b(notificaci[oó]n|certificado de env[ií]o|c[eé]dula)\b/i,
  },
  {
    tipo: "resolucion",
    relevante: true,
    re: /\b(sentencia|resoluci[oó]n|auto|decreto|fallo|acoge|rechaza|declara)\b/i,
  },
  {
    tipo: "proveido",
    relevante: false,
    re: /\b(prove[ií]do|proveido|t[eé]ngase presente|por presentado)\b/i,
  },
  {
    tipo: "escrito",
    relevante: false,
    re: /\b(escrito|presentaci[oó]n|demanda|contestaci[oó]n|recurso|apelaci[oó]n|casaci[oó]n)\b/i,
  },
  {
    tipo: "plazo",
    relevante: true,
    re: /\b(plazo|d[ií]as?\s+h[aá]biles|fatal|vencimiento)\b/i,
  },
];

/** Escritos / presentaciones aún sin proveído — señal CausaMonitor "escritos por resolver". */
export function isEscritoPendienteResolucion(
  titulo: string,
  detalle?: string | null
) {
  const text = `${titulo} ${detalle || ""}`;
  if (/\bescritos?\s+por\s+resolver\b/i.test(text)) return true;
  if (
    /\b(por\s+resolver|pendiente\s+de\s+resoluci[oó]n|sin\s+prove[ií]do|pendiente\s+de\s+prove[ií]do)\b/i.test(
      text
    )
  ) {
    return /\b(escrito|presentaci[oó]n|demanda|recurso|solicitud|petici[oó]n)\b/i.test(
      text
    );
  }
  return false;
}

export function classifyMovimiento(titulo: string, detalle?: string | null) {
  const text = `${titulo} ${detalle || ""}`;
  const pendienteResolucion = isEscritoPendienteResolucion(titulo, detalle);
  if (pendienteResolucion) {
    return {
      tipo: "escrito" as const,
      relevante: true,
      pendienteResolucion: true,
    };
  }
  for (const rule of RULES) {
    if (rule.re.test(text)) {
      return {
        tipo: rule.tipo,
        relevante: rule.relevante,
        pendienteResolucion: false,
      };
    }
  }
  return {
    tipo: "otro" as const,
    relevante: false,
    pendienteResolucion: false,
  };
}

export function labelMovimientoTipo(tipo: string) {
  const map: Record<string, string> = {
    proveido: "Proveído",
    resolucion: "Resolución",
    audiencia: "Audiencia",
    escrito: "Escrito",
    notificacion: "Notificación",
    plazo: "Plazo",
    otro: "Otro",
  };
  return map[tipo] || tipo;
}

/** Semáforo de cartera (estilo CaseTracking). */
export type Semaforo = "verde" | "amarillo" | "rojo" | "gris";

export function semaforoPorDiasSinMovimiento(dias: number | null): Semaforo {
  if (dias === null) return "gris";
  if (dias <= 7) return "verde";
  if (dias <= 21) return "amarillo";
  return "rojo";
}

export function labelSemaforo(s: Semaforo) {
  if (s === "verde") return "Al día";
  if (s === "amarillo") return "Sin movimiento reciente";
  if (s === "rojo") return "Atención: inactiva";
  return "Sin datos";
}

export function diasEntre(from: Date, to = new Date()) {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 12);
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 12);
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
}
