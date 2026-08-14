/**
 * Selectores y helpers del DOM real de Oficina Judicial Virtual.
 * Fuente de verdad: portal OJV + scrapers de campo (consulta_causas_pjud).
 * Paridad producto: CausaMonitor — acceso invitado **y** ClaveÚnica
 * (credenciales cifradas en vault local).
 *
 * Flujo invitado:
 *   home → accesoConsultaCausas() → tabs (#BusJuridica / ROL) →
 *   #jurCompetencia + #jurTribunal|#corteJur → #btnConConsultaJur →
 *   #verDetalleJuridica → modal .modal.in (table.table-titulos + historia)
 */

export const OJV_BASE = "https://oficinajudicialvirtual.pjud.cl";
export const OJV_HOME = `${OJV_BASE}/home/index.php`;
/** Shell autenticado post ClaveÚnica (aparece referenciado desde el home). */
export const OJV_INDEX_N = `${OJV_BASE}/indexN.php`;
export const OJV_CONSULTA_URL =
  "https://www.pjud.cl/consulta-unificada-de-causas";

export const OJV_POST_AUTH_URLS = [OJV_INDEX_N, OJV_HOME] as const;

export const OJV = {
  accesoConsulta: 'button.dropbtn[onclick*="accesoConsultaCausas"], a[onclick*="accesoConsultaCausas"]',
  captchaImg:
    'img[src*="captcha"], img[alt*="captcha" i], #captcha_image, .captcha-image img',
  captchaInput:
    'input[name*="captcha" i], #captcha_response, input[type="text"][id*="captcha" i]',
  submit: 'button[type="submit"], input[type="submit"]',
  // RUT persona jurídica (referencia consulta_causas_pjud)
  tabBusJuridica: 'a[href="#BusJuridica"]',
  rutJur: "#rutJur",
  dvJur: "#dvJur",
  eraJur: "#eraJur",
  // ROL / RIT (tabs variables según layout OJV)
  tabBusRol:
    'a[href="#BusCausa"], a[href="#buscCausa"], a[href*="BusRol" i], a:has-text("RIT"), a:has-text("ROL")',
  competencia: "#jurCompetencia",
  tribunal: "#jurTribunal",
  corte: "#corteJur",
  /** Prefer visible active-pane Buscar; juridica id is often hidden on ROL tab. */
  btnBuscar: "#btnConConsultaJur",
  btnBuscarAny:
    '#btnConConsultaJur, #btnConConsultaCausa, #btnConConsultaRol, #btnBuscar, .tab-pane.active button.btn-primary, button.btn-primary:has-text("Buscar")',
  loader: "#loadPreJuridica, #loadPreCausa, .loadingConsulta",
  resultsHost: "#resultConsultaJuridica",
  resultsTable: "#verDetalleJuridica",
  noResultsText: "No se han encontrado resultados",
  modal: '.modal.in[style*="display: block"], .modal.in, .modal.show',
  modalTitulos: "table.table-titulos",
  ebookForm: "#contenedorEbook form, form[action*='ebook' i]",
  historiaTab:
    'a[href*="historia" i], a:has-text("Historia"), a:has-text("Movimientos"), a[href*="anexo" i]',
  receptorTab:
    'a[href*="receptor" i], a:has-text("Receptor"), a[href*="notific" i]',
  escritosTab:
    'a[href*="escrito" i], a:has-text("Escrito"), a:has-text("Escritos"), a:has-text("por resolver")',
  sweetAlert: ".sweet-alert.showSweetAlert.visible",
  sweetConfirm:
    ".sweet-alert.showSweetAlert.visible button.confirm, .sweet-alert.visible button.confirm",
  // Mis Causas (sesión ClaveÚnica) — menú izquierdo + materias + Buscar
  misCausasMenu:
    'a:has-text("Mis Causas"), a:has-text("MIS CAUSAS"), #menuMisCausas, [onclick*="MisCausas" i]',
  misCausasBuscar:
    'button:has-text("Buscar"), input[type="submit"][value*="Buscar" i], #btnBuscar',
} as const;

export type OjvCompetenciaValue = "1" | "2" | "3" | "4" | "5" | "6";

export function inferCompetenciaFromTribunal(
  tribunal: string
): OjvCompetenciaValue {
  const t = tribunal.toLowerCase();
  if (/suprema/.test(t)) return "1";
  if (/apelaci[oó]n|corte de apel/.test(t)) return "2";
  if (/laboral|juzgado del trabajo|cobranza laboral|previsional/.test(t))
    return "4";
  if (
    /garant[ií]a|penal|oral en lo penal|tribunal oral|juicio oral/.test(t)
  ) {
    return "5";
  }
  if (/cobranza/.test(t)) return "6";
  // Familia y civiles de letras caen en competencia civil OJV (3).
  return "3";
}

/** Tokenize for fuzzy tribunal matching (º/°/1er ≈ 1). */
export function tribunalMatchTokens(label: string) {
  return normalizeTribunalLabel(label)
    .replace(/\b(\d+)(?:º|°|o|er|ra|do|da|to|ta|mo|ma|vo|va|no|na)?\b/gi, "$1")
    .replace(/\bprimer[oa]?\b/g, "1")
    .replace(/\bsegund[oa]\b/g, "2")
    .replace(/\btercer[oa]?\b/g, "3")
    .split(/[^a-z0-9áéíóúñ]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !/^(de|del|la|el|los|las|y|en|lo)$/i.test(t));
}

/** 0..1 score; prefer exact / containment. */
export function tribunalMatchScore(optionLabel: string, wanted: string) {
  if (isPlaceholderTribunal(wanted)) return 0;
  const a = normalizeTribunalLabel(optionLabel);
  const b = normalizeTribunalLabel(wanted);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.92;
  const ta = new Set(tribunalMatchTokens(optionLabel));
  const tb = tribunalMatchTokens(wanted);
  if (!tb.length) return 0;
  let hit = 0;
  for (const t of tb) if (ta.has(t)) hit += 1;
  const overlap = hit / tb.length;
  // Require city/comuna-ish token when possible
  return overlap;
}

/** Fuzzy match a tribunal option label against causa.tribunal. */
export function tribunalLabelsMatch(optionLabel: string, wanted: string) {
  return tribunalMatchScore(optionLabel, wanted) >= 0.72;
}

/** Pick best option from OJV <select> labels. */
export function pickBestTribunalOption(
  options: Array<{ value: string; label: string }>,
  wanted: string
): { value: string; label: string; score: number } | null {
  let best: { value: string; label: string; score: number } | null = null;
  for (const o of options) {
    if (!o.value || o.value === "0") continue;
    if (/seleccione/i.test(o.label)) continue;
    const score = tribunalMatchScore(o.label, wanted);
    if (score < 0.72) continue;
    if (!best || score > best.score) best = { ...o, score };
  }
  return best;
}

/** Split Chilean RUT into cuerpo + DV. Accepts dotted/dashed forms. */
export function splitRut(rut: string): { cuerpo: string; dv: string } | null {
  const cleaned = rut.replace(/\./g, "").replace(/\s/g, "").toUpperCase();
  const m = cleaned.match(/^(\d{6,8})-([\dK])$/);
  if (m) return { cuerpo: m[1], dv: m[2] };
  if (/^\d{6,8}[\dK]$/.test(cleaned)) {
    return { cuerpo: cleaned.slice(0, -1), dv: cleaned.slice(-1) };
  }
  return null;
}

/** Parse RIT like C-100-2024 or 100-2024 → { tipo?, numero, era }. */
export function parseRitParts(rit: string): {
  tipo: string | null;
  numero: string;
  era: string;
} | null {
  const raw = rit.trim().toUpperCase().replace(/\s+/g, "");
  const withTipo = raw.match(/^([A-Z]{1,4})-(\d{1,6})-(\d{4})$/);
  if (withTipo) {
    return { tipo: withTipo[1], numero: withTipo[2], era: withTipo[3] };
  }
  const plain = raw.match(/^(\d{1,6})-(\d{4})$/);
  if (plain) return { tipo: null, numero: plain[1], era: plain[2] };
  return null;
}

export function normalizeTribunalLabel(label: string) {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when Mis Causas / parsers could not resolve a real tribunal name. */
export function isPlaceholderTribunal(tribunal: string | null | undefined) {
  const t = (tribunal || "").trim();
  if (!t) return true;
  return /no identificado|sin tribunal|desconocido|por (clasificar|identificar)|^tribunal$/i.test(
    t
  );
}

const TRIBUNAL_CELL_RE =
  /juzgado|corte de|tribunal oral|tribunal de|tribunal constitucional|juz\.\s|jpl\b|polic[ií]a local|garant[ií]a|cobranza|familia|laboral|\bcivil\b|\bpenal\b|apelaci[oó]n|suprema/i;

/** Pick best tribunal label from table cells; null if none look real. */
export function pickTribunalFromTexts(texts: string[]): string | null {
  const cleaned = texts.map((c) => c.replace(/\s+/g, " ").trim()).filter(Boolean);
  const strong = cleaned.find((c) =>
    /juzgado|corte de|tribunal oral|tribunal de|tribunal constitucional|polic[ií]a local/i.test(
      c
    )
  );
  if (strong) return strong.slice(0, 180);
  const soft = cleaned.find((c) => TRIBUNAL_CELL_RE.test(c) && c.length >= 4);
  if (soft) return soft.slice(0, 180);
  return null;
}

export const BROWSER_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-blink-features=AutomationControlled",
];

export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
