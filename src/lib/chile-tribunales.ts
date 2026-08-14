/**
 * Catálogo amplio de tribunales Chile para alta por ROL / OJV.
 * No es exhaustivo al 100% (PJUD cambia dotación); el UI permite texto libre
 * además de esta lista. Mantener nombres cercanos a OJV (º, “de Letras”, etc.).
 */

function seq(n: number, fmt: (i: number) => string): string[] {
  return Array.from({ length: n }, (_, i) => fmt(i + 1));
}

function civiles(lugar: string, n: number) {
  return seq(n, (i) => `${i}º Juzgado Civil de ${lugar}`);
}

function letras(lugar: string, n = 1) {
  if (n === 1) return [`Juzgado de Letras de ${lugar}`];
  return seq(n, (i) => `${i}º Juzgado de Letras de ${lugar}`);
}

function familia(lugar: string, n: number) {
  if (n === 1) return [`Juzgado de Familia de ${lugar}`];
  return seq(n, (i) => `${i}º Juzgado de Familia de ${lugar}`);
}

function garantia(lugar: string, n: number) {
  if (n === 1) return [`Juzgado de Garantía de ${lugar}`];
  return seq(n, (i) => `${i}º Juzgado de Garantía de ${lugar}`);
}

function trabajo(lugar: string, n: number) {
  if (n === 1) return [`Juzgado de Letras del Trabajo de ${lugar}`];
  return seq(n, (i) => `${i}º Juzgado de Letras del Trabajo de ${lugar}`);
}

function cobranza(lugar: string, n = 1) {
  if (n === 1) {
    return [`Juzgado de Cobranza Laboral y Previsional de ${lugar}`];
  }
  return seq(
    n,
    (i) => `${i}º Juzgado de Cobranza Laboral y Previsional de ${lugar}`
  );
}

function top(lugar: string) {
  return [`Tribunal de Juicio Oral en lo Penal de ${lugar}`];
}

/** Cortes de Apelaciones (competencia 2 en OJV). */
export const CORTES_APELACIONES = [
  "Corte de Apelaciones de Arica",
  "Corte de Apelaciones de Iquique",
  "Corte de Apelaciones de Antofagasta",
  "Corte de Apelaciones de Copiapó",
  "Corte de Apelaciones de La Serena",
  "Corte de Apelaciones de Valparaíso",
  "Corte de Apelaciones de Santiago",
  "Corte de Apelaciones de San Miguel",
  "Corte de Apelaciones de Rancagua",
  "Corte de Apelaciones de Talca",
  "Corte de Apelaciones de Chillán",
  "Corte de Apelaciones de Concepción",
  "Corte de Apelaciones de Temuco",
  "Corte de Apelaciones de Valdivia",
  "Corte de Apelaciones de Puerto Montt",
  "Corte de Apelaciones de Coyhaique",
  "Corte de Apelaciones de Punta Arenas",
] as const;

const RM = [
  ...civiles("Santiago", 30),
  ...civiles("San Miguel", 8),
  ...familia("Santiago", 4),
  ...familia("San Miguel", 2),
  ...familia("Pudahuel", 1),
  ...familia("Puente Alto", 1),
  ...familia("San Bernardo", 1),
  ...garantia("Santiago", 13),
  ...garantia("San Miguel", 2),
  ...garantia("Puente Alto", 1),
  ...garantia("San Bernardo", 1),
  ...garantia("Colina", 1),
  ...top("Santiago"),
  ...top("San Miguel"),
  ...trabajo("Santiago", 2),
  ...trabajo("San Miguel", 1),
  ...cobranza("Santiago", 2),
  ...letras("Puente Alto", 2),
  ...letras("Colina"),
  ...letras("Melipilla"),
  ...letras("Talagante"),
  ...letras("Buin"),
  ...letras("Peñaflor"),
  ...letras("Curacaví"),
  ...letras("Isla de Maipo"),
  "Juzgado de Letras y Garantía de Peñaflor",
];

const VALPO = [
  ...civiles("Valparaíso", 5),
  ...civiles("Viña del Mar", 3),
  ...familia("Valparaíso", 2),
  ...familia("Viña del Mar", 1),
  ...garantia("Valparaíso", 3),
  ...garantia("Viña del Mar", 2),
  ...top("Valparaíso"),
  ...trabajo("Valparaíso", 2),
  ...cobranza("Valparaíso"),
  ...letras("Quillota", 2),
  ...letras("San Antonio", 2),
  ...letras("Los Andes"),
  ...letras("San Felipe"),
  ...letras("La Calera"),
  ...letras("Quilpué"),
  ...letras("Villa Alemana"),
  ...letras("Limache"),
  ...letras("Casablanca"),
  ...letras("La Ligua"),
  ...letras("Petorca"),
  ...garantia("San Antonio", 1),
  ...garantia("Quillota", 1),
];

const NORTE = [
  ...civiles("Arica", 2),
  ...familia("Arica", 1),
  ...garantia("Arica", 2),
  ...top("Arica"),
  ...trabajo("Arica", 1),
  ...letras("Arica"),
  ...civiles("Iquique", 2),
  ...familia("Iquique", 1),
  ...garantia("Iquique", 2),
  ...top("Iquique"),
  ...trabajo("Iquique", 1),
  ...letras("Iquique"),
  ...letras("Pozo Almonte"),
  ...civiles("Antofagasta", 4),
  ...familia("Antofagasta", 1),
  ...garantia("Antofagasta", 3),
  ...top("Antofagasta"),
  ...trabajo("Antofagasta", 1),
  ...cobranza("Antofagasta"),
  ...letras("Calama", 2),
  ...letras("Tocopilla"),
  ...letras("Mejillones"),
  ...garantia("Calama", 1),
  ...civiles("Copiapó", 2),
  ...familia("Copiapó", 1),
  ...garantia("Copiapó", 2),
  ...top("Copiapó"),
  ...trabajo("Copiapó", 1),
  ...letras("Vallenar"),
  ...letras("Chañaral"),
  ...letras("Caldera"),
  ...civiles("La Serena", 3),
  ...familia("La Serena", 1),
  ...familia("Coquimbo", 1),
  ...garantia("La Serena", 2),
  ...garantia("Coquimbo", 1),
  ...top("La Serena"),
  ...trabajo("La Serena", 1),
  ...letras("Coquimbo"),
  ...letras("Ovalle", 2),
  ...letras("Illapel"),
  ...letras("Vicuña"),
];

const CENTRO_SUR = [
  ...civiles("Rancagua", 4),
  ...familia("Rancagua", 2),
  ...garantia("Rancagua", 3),
  ...top("Rancagua"),
  ...trabajo("Rancagua", 1),
  ...cobranza("Rancagua"),
  ...letras("San Fernando", 2),
  ...letras("Rengo"),
  ...letras("San Vicente de Tagua Tagua"),
  ...letras("Pichilemu"),
  ...letras("Santa Cruz"),
  ...civiles("Talca", 3),
  ...familia("Talca", 1),
  ...garantia("Talca", 2),
  ...top("Talca"),
  ...trabajo("Talca", 1),
  ...letras("Curicó", 2),
  ...letras("Linares", 2),
  ...letras("Constitución"),
  ...letras("Cauquenes"),
  ...letras("Parral"),
  ...letras("Molina"),
  ...civiles("Chillán", 2),
  ...familia("Chillán", 1),
  ...garantia("Chillán", 2),
  ...top("Chillán"),
  ...trabajo("Chillán", 1),
  ...letras("San Carlos"),
  ...letras("Bulnes"),
  ...letras("Yungay"),
  ...civiles("Concepción", 6),
  ...familia("Concepción", 2),
  ...garantia("Concepción", 4),
  ...top("Concepción"),
  ...trabajo("Concepción", 2),
  ...cobranza("Concepción"),
  ...letras("Los Ángeles", 2),
  ...letras("Coronel"),
  ...letras("Lota"),
  ...letras("Talcahuano", 2),
  ...letras("Chiguayante"),
  ...letras("San Pedro de la Paz"),
  ...letras("Arauco"),
  ...letras("Curanilahue"),
  ...letras("Lebu"),
  ...letras("Cabrero"),
  ...garantia("Los Ángeles", 1),
  ...garantia("Talcahuano", 1),
];

const SUR = [
  ...civiles("Temuco", 4),
  ...familia("Temuco", 2),
  ...garantia("Temuco", 3),
  ...top("Temuco"),
  ...trabajo("Temuco", 1),
  ...letras("Villarrica"),
  ...letras("Pucón"),
  ...letras("Angol", 2),
  ...letras("Victoria"),
  ...letras("Nueva Imperial"),
  ...letras("Lautaro"),
  ...letras("Pitrufquén"),
  ...garantia("Angol", 1),
  ...civiles("Valdivia", 2),
  ...familia("Valdivia", 1),
  ...garantia("Valdivia", 2),
  ...top("Valdivia"),
  ...trabajo("Valdivia", 1),
  ...letras("La Unión"),
  ...letras("Río Bueno"),
  ...letras("Panguipulli"),
  ...civiles("Puerto Montt", 3),
  ...familia("Puerto Montt", 1),
  ...garantia("Puerto Montt", 2),
  ...top("Puerto Montt"),
  ...trabajo("Puerto Montt", 1),
  ...letras("Osorno", 2),
  ...letras("Puerto Varas"),
  ...letras("Castro", 2),
  ...letras("Ancud"),
  ...letras("Quellón"),
  ...garantia("Osorno", 1),
  ...garantia("Castro", 1),
  ...familia("Osorno", 1),
  ...letras("Coyhaique"),
  ...letras("Aysén"),
  ...letras("Chile Chico"),
  ...garantia("Coyhaique", 1),
  ...familia("Coyhaique", 1),
  ...top("Coyhaique"),
  ...letras("Punta Arenas", 2),
  ...familia("Punta Arenas", 1),
  ...garantia("Punta Arenas", 1),
  ...top("Punta Arenas"),
  ...trabajo("Punta Arenas", 1),
  ...letras("Puerto Natales"),
  ...letras("Porvenir"),
];

const ESPECIALES = [
  "Corte Suprema",
  "Tribunal Constitucional",
  "1º Tribunal Ambiental",
  "2º Tribunal Ambiental",
  "3º Tribunal Ambiental",
  "Tribunal de Contratación Pública",
];

function dedupe(list: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const t = raw.replace(/\s+/g, " ").trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** Lista canónica ampliada (orden: cortes → RM → regiones). */
export const TRIBUNALES_CHILE_EXPANDED: string[] = dedupe([
  ...ESPECIALES,
  ...CORTES_APELACIONES,
  ...RM,
  ...VALPO,
  ...NORTE,
  ...CENTRO_SUR,
  ...SUR,
]);
