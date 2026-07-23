export const MATERIAS = [
  { value: "civil", label: "Civil" },
  { value: "laboral", label: "Laboral" },
  { value: "penal", label: "Penal" },
  { value: "familia", label: "Familia" },
  { value: "administrativo", label: "Administrativo" },
  { value: "constitucional", label: "Constitucional" },
] as const;

export const ESTADOS_CAUSA = [
  { value: "activa", label: "Activa" },
  { value: "suspensa", label: "Suspensa" },
  { value: "terminada", label: "Terminada" },
  { value: "archivada", label: "Archivada" },
] as const;

export const ETAPAS = [
  { value: "ingreso", label: "Ingreso" },
  { value: "notificacion", label: "Notificación" },
  { value: "contestacion", label: "Contestación" },
  { value: "prueba", label: "Prueba" },
  { value: "sentencia", label: "Sentencia" },
  { value: "recurso", label: "Recurso" },
  { value: "ejecucion", label: "Ejecución" },
] as const;

export const TRIBUNALES_CHILE = [
  "1º Juzgado Civil de Santiago",
  "2º Juzgado Civil de Santiago",
  "30º Juzgado Civil de Santiago",
  "1º Juzgado de Letras del Trabajo de Santiago",
  "2º Juzgado de Letras del Trabajo de Santiago",
  "Juzgado de Familia de Santiago",
  "7º Juzgado de Garantía de Santiago",
  "Tribunal Oral en lo Penal de Santiago",
  "Corte de Apelaciones de Santiago",
  "Corte de Apelaciones de Valparaíso",
  "Corte de Apelaciones de Concepción",
  "Corte Suprema",
  "Tribunal Constitucional",
] as const;

export function labelMateria(value: string) {
  return MATERIAS.find((m) => m.value === value)?.label ?? value;
}

export function labelEstado(value: string) {
  return ESTADOS_CAUSA.find((m) => m.value === value)?.label ?? value;
}

export function labelEtapa(value: string) {
  return ETAPAS.find((m) => m.value === value)?.label ?? value;
}

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}
