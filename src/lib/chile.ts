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
  // Santiago / RM
  "1º Juzgado Civil de Santiago",
  "2º Juzgado Civil de Santiago",
  "4º Juzgado Civil de Santiago",
  "10º Juzgado Civil de Santiago",
  "20º Juzgado Civil de Santiago",
  "30º Juzgado Civil de Santiago",
  "1º Juzgado de Letras del Trabajo de Santiago",
  "2º Juzgado de Letras del Trabajo de Santiago",
  "1º Juzgado de Cobranza Laboral y Previsional de Santiago",
  "Juzgado de Familia de Santiago",
  "2º Juzgado de Familia de Santiago",
  "7º Juzgado de Garantía de Santiago",
  "8º Juzgado de Garantía de Santiago",
  "Tribunal Oral en lo Penal de Santiago",
  "1º Juzgado Civil de San Miguel",
  "Juzgado de Letras de Puente Alto",
  "Juzgado de Letras de Colina",
  // Cortes
  "Corte de Apelaciones de Santiago",
  "Corte de Apelaciones de San Miguel",
  "Corte de Apelaciones de Valparaíso",
  "Corte de Apelaciones de Rancagua",
  "Corte de Apelaciones de Talca",
  "Corte de Apelaciones de Chillán",
  "Corte de Apelaciones de Concepción",
  "Corte de Apelaciones de Temuco",
  "Corte de Apelaciones de Valdivia",
  "Corte de Apelaciones de Puerto Montt",
  "Corte de Apelaciones de Coyhaique",
  "Corte de Apelaciones de Punta Arenas",
  "Corte de Apelaciones de Antofagasta",
  "Corte de Apelaciones de Iquique",
  "Corte de Apelaciones de Arica",
  "Corte de Apelaciones de La Serena",
  "Corte de Apelaciones de Copiapó",
  "Corte Suprema",
  "Tribunal Constitucional",
  // Regiones (muestra representativa; alta libre sigue permitiendo texto libre)
  "1º Juzgado Civil de Valparaíso",
  "1º Juzgado de Letras del Trabajo de Valparaíso",
  "Juzgado de Letras de Viña del Mar",
  "1º Juzgado Civil de Concepción",
  "Juzgado de Letras del Trabajo de Concepción",
  "1º Juzgado de Letras de Temuco",
  "Juzgado de Letras de Puerto Montt",
  "1º Juzgado de Letras de Antofagasta",
  "Juzgado de Letras de La Serena",
  "1º Juzgado de Letras de Rancagua",
  "Juzgado de Letras de Talca",
  "Juzgado de Letras de Chillán",
  "Juzgado de Letras de Valdivia",
  "Juzgado de Letras de Iquique",
  "Juzgado de Letras de Arica",
  "Juzgado de Letras de Punta Arenas",
  "1º Juzgado de Letras de Copiapó",
  "Juzgado de Letras de Los Ángeles",
  "Juzgado de Letras de Osorno",
  "Juzgado de Letras de Curicó",
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

/** Guiones tipográficos (en-dash, em-dash, minus) → hyphen ASCII. */
function rutCuerpoDv(rut: string): { body: string; dv: string } | null {
  const clean = rut
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\./g, "")
    .replace(/\s/g, "")
    .toUpperCase();
  const m = clean.match(/^(\d{7,8})-?([\dK])$/);
  if (!m) return null;
  return { body: m[1], dv: m[2] };
}

/** Valida RUT chileno (con o sin puntos; guión opcional). */
export function validarRut(rut: string): boolean {
  const parts = rutCuerpoDv(rut);
  if (!parts) return false;
  const { body, dv } = parts;
  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const mod = 11 - (sum % 11);
  const expected = mod === 11 ? "0" : mod === 10 ? "K" : String(mod);
  return dv === expected;
}

/** RIT típico Chile: C-1234-2025 / O-1189-2025 / 71345-2025 */
export function validarRit(rit: string): boolean {
  const v = rit.trim().toUpperCase();
  return /^[A-Z]{0,3}-?\d{1,6}-\d{4}$/.test(v) || /^\d{4,6}-\d{4}$/.test(v);
}

/** RUC judicial chileno: cuerpo numérico y dígito verificador. */
export function validarRuc(ruc: string): boolean {
  const v = ruc.trim().toUpperCase().replace(/\./g, "");
  return /^\d{10,12}-?[\dK]$/.test(v);
}

export function normalizarRut(rut: string): string {
  const parts = rutCuerpoDv(rut);
  if (!parts) return rut.trim();
  return `${parts.body}-${parts.dv}`;
}
