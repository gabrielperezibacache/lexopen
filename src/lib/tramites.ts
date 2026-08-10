export const TRAMITE_ESTADOS = [
  "pendiente",
  "en_curso",
  "hecho",
  "cancelado",
] as const;

export type TramiteEstado = (typeof TRAMITE_ESTADOS)[number];

export const TRAMITES_ABIERTOS: TramiteEstado[] = ["pendiente", "en_curso"];

export function labelTramiteEstado(estado: string) {
  const map: Record<string, string> = {
    pendiente: "Pendiente",
    en_curso: "En curso",
    hecho: "Hecho",
    cancelado: "Cancelado",
  };
  return map[estado] || estado;
}

export function isTramiteAbierto(estado: string) {
  return TRAMITES_ABIERTOS.includes(estado as TramiteEstado);
}

export function isTramiteEstado(value: string): value is TramiteEstado {
  return (TRAMITE_ESTADOS as readonly string[]).includes(value);
}
