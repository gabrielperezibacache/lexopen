/**
 * Catálogo de eventos notificables (plan §6.5.1). In-app siempre se registra;
 * los canales externos se resuelven con preferencias del usuario.
 */

export const EXTERNAL_CHANNELS = ["email", "telegram", "push"] as const;
export type ExternalChannel = (typeof EXTERNAL_CHANNELS)[number];
export type Canal = "inapp" | ExternalChannel;

export const MODOS = ["realtime", "digest_diario", "digest_semanal", "off"] as const;
export type Modo = (typeof MODOS)[number];

export type Severidad = "critica" | "alta" | "media" | "baja";

export const NIVELES_DETALLE = ["minimo", "estandar", "detallado"] as const;
export type NivelDetalle = (typeof NIVELES_DETALLE)[number];

export type TipoDef = {
  label: string;
  severidad: Severidad;
  defaults: Record<ExternalChannel, Modo>;
  /** false = el usuario solo elige canal; se garantiza in-app + 1 canal externo. */
  apagable: boolean;
  /** Sección del digest (§12.1). */
  seccion: "fatales" | "plazos" | "aprobaciones" | "pjud" | "tareas" | "mensajes" | "sistema" | "otros";
  /** Destinatarios solo admin (sistema). */
  soloAdmin?: boolean;
};

const OFF: Record<ExternalChannel, Modo> = { email: "off", telegram: "off", push: "off" };

export const CATALOGO = {
  "plazo.fatal": {
    label: "Plazo fatal (T-7, T-3, T-1, T-0)",
    severidad: "critica",
    defaults: { email: "realtime", telegram: "realtime", push: "realtime" },
    apagable: false,
    seccion: "fatales",
  },
  "plazo.fatal.escalamiento": {
    label: "Escalamiento de plazo fatal sin acuse",
    severidad: "critica",
    defaults: { email: "realtime", telegram: "realtime", push: "realtime" },
    apagable: false,
    seccion: "fatales",
  },
  "plazo.normal": {
    label: "Plazo no fatal (T-3, T-0)",
    severidad: "alta",
    defaults: { email: "digest_diario", telegram: "off", push: "off" },
    apagable: true,
    seccion: "plazos",
  },
  "pjud.movimiento": {
    label: "Movimiento PJUD relevante",
    severidad: "media",
    defaults: { email: "digest_diario", telegram: "off", push: "off" },
    apagable: true,
    seccion: "pjud",
  },
  "pjud.digest": {
    label: "Resumen PJUD",
    severidad: "baja",
    defaults: OFF,
    apagable: true,
    seccion: "pjud",
  },
  "tarea.asignada": {
    label: "Tarea asignada",
    severidad: "media",
    defaults: { email: "digest_diario", telegram: "off", push: "off" },
    apagable: true,
    seccion: "tareas",
  },
  "tramite.asignado": {
    label: "Trámite asignado",
    severidad: "media",
    defaults: { email: "digest_diario", telegram: "off", push: "off" },
    apagable: true,
    seccion: "tareas",
  },
  "minuta.nueva": {
    label: "Nueva minuta en una causa",
    severidad: "media",
    defaults: { email: "digest_diario", telegram: "off", push: "off" },
    apagable: true,
    seccion: "tareas",
  },
  "mensaje.interno": {
    label: "Mensaje interno",
    severidad: "media",
    defaults: { email: "off", telegram: "off", push: "realtime" },
    apagable: true,
    seccion: "mensajes",
  },
  "sistema.canal_caido": {
    label: "Canal de notificación con fallas",
    severidad: "alta",
    defaults: { email: "realtime", telegram: "off", push: "off" },
    apagable: false,
    seccion: "sistema",
    soloAdmin: true,
  },
  general: {
    label: "Otras novedades",
    severidad: "baja",
    defaults: OFF,
    apagable: true,
    seccion: "otros",
  },
} satisfies Record<string, TipoDef>;

export type TipoNotificacion = keyof typeof CATALOGO;

export function tipoDef(tipo: string): TipoDef {
  return (CATALOGO as Record<string, TipoDef>)[tipo] || CATALOGO.general;
}

export function isTipo(value: string): value is TipoNotificacion {
  return Object.prototype.hasOwnProperty.call(CATALOGO, value);
}

export function isModo(value: string): value is Modo {
  return (MODOS as readonly string[]).includes(value);
}

export function isExternalChannel(value: string): value is ExternalChannel {
  return (EXTERNAL_CHANNELS as readonly string[]).includes(value);
}

export function isNivelDetalle(value: string): value is NivelDetalle {
  return (NIVELES_DETALLE as readonly string[]).includes(value);
}

export function prioridadPara(severidad: Severidad): number {
  return { critica: 0, alta: 2, media: 5, baja: 7 }[severidad];
}

/** Canales que se ofrecen en 1.1. WhatsApp entra en 1.2 vía el mismo adaptador. */
export const CANAL_LABEL: Record<ExternalChannel, string> = {
  email: "Email",
  telegram: "Telegram",
  push: "Push (navegador/PWA)",
};
