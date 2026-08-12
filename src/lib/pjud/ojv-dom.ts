/**
 * Selectores y helpers del DOM real de Oficina Judicial Virtual,
 * alineados con scrapers de campo (consulta_causas_pjud) y mcp-legal-chile.
 *
 * Flujo invitado:
 *   home → accesoConsultaCausas() → tabs (#BusJuridica / ROL) →
 *   #jurCompetencia + #jurTribunal|#corteJur → #btnConConsultaJur →
 *   #verDetalleJuridica → modal .modal.in (table.table-titulos + historia)
 */

export const OJV_BASE = "https://oficinajudicialvirtual.pjud.cl";
export const OJV_HOME = `${OJV_BASE}/home/index.php`;
export const OJV_CONSULTA_URL =
  "https://www.pjud.cl/consulta-unificada-de-causas";

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
  btnBuscar: "#btnConConsultaJur",
  loader: "#loadPreJuridica",
  resultsHost: "#resultConsultaJuridica",
  resultsTable: "#verDetalleJuridica",
  noResultsText: "No se han encontrado resultados",
  modal: '.modal.in[style*="display: block"], .modal.in',
  modalTitulos: "table.table-titulos",
  ebookForm: "#contenedorEbook form, form[action*='ebook' i]",
  historiaTab:
    'a[href*="historia" i], a:has-text("Historia"), a:has-text("Movimientos"), a[href*="anexo" i]',
  receptorTab:
    'a[href*="receptor" i], a:has-text("Receptor"), a[href*="notific" i]',
  sweetAlert: ".sweet-alert.showSweetAlert.visible",
  sweetConfirm:
    ".sweet-alert.showSweetAlert.visible button.confirm, .sweet-alert.visible button.confirm",
} as const;

export type OjvCompetenciaValue = "1" | "2" | "3" | "4" | "5" | "6";

export function inferCompetenciaFromTribunal(
  tribunal: string
): OjvCompetenciaValue {
  const t = tribunal.toLowerCase();
  if (/suprema/.test(t)) return "1";
  if (/apelaci[oó]n|corte de apel/.test(t)) return "2";
  if (/laboral|juzgado del trabajo|cobranza laboral/.test(t)) return "4";
  if (/garant[ií]a|penal|oral en lo penal|tribunal oral/.test(t)) return "5";
  if (/cobranza/.test(t)) return "6";
  return "3"; // Civil default
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

/** Fuzzy match a tribunal option label against causa.tribunal. */
export function tribunalLabelsMatch(optionLabel: string, wanted: string) {
  const a = normalizeTribunalLabel(optionLabel);
  const b = normalizeTribunalLabel(wanted);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  // Strip ordinal prefixes: "1º juzgado civil de santiago"
  const strip = (s: string) =>
    s
      .replace(/^\d+\s*[ºo°.]?\s*/i, "")
      .replace(/\bjuzgado\b/g, "")
      .replace(/\bde\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const sa = strip(a);
  const sb = strip(b);
  return Boolean(sa && sb && (sa.includes(sb) || sb.includes(sa)));
}

export const BROWSER_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-blink-features=AutomationControlled",
];

export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
