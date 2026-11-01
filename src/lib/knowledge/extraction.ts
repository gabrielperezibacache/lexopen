import { createHash } from "node:crypto";

/** Extractive proposals only. These functions perform no IO or legal inference. */
export const FACT_EXTRACTION_VERSION = "lexopen-facts-1";
export const KNOWLEDGE_EXTRACTION_LIMITS = { inputCharacters: 100_000, sentences: 200, quoteCharacters: 2_000, proposals: 10, comparisonFacts: 200, comparisonStatementCharacters: 10_000, contradictions: 20 } as const;

export type TemporalPrecision = "day" | "month" | "year" | "range" | "ambiguous" | "unknown";
export type TemporalEvidence = { literal: string | null; start: string | null; end: string | null; precision: TemporalPrecision; inferred: boolean; warning: string | null };
export type FactAmount = { literal: string; currency: "CLP" | "USD" | "EUR" | "UF" | "unknown-dollar" | "unknown-peso"; value: string | null; qualified: boolean };
export type EvidenceFragmentInput = { id?: string; fragmentId?: string; text: string };
export type FactProposal = { fragmentId: string; statement: string; quote: string; fingerprint: string; temporal: TemporalEvidence; amounts: FactAmount[]; comparisonKey: null };
export type ComparableFact = { id: string; comparisonKey?: string | null; statement: string; temporal?: TemporalEvidence; amounts?: FactAmount[] };
export type PotentialContradiction = { leftFactId: string; rightFactId: string; kind: "date" | "money"; reason: string; status: "proposed"; fingerprint: string };

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MONTH_PATTERN = `(?:${MONTHS.join("|")}|setiembre)`;
const normalize = (value: string) => value.normalize("NFC").toLocaleLowerCase("es").replace(/\s+/g, " ").trim();
const words = (value: string) => normalize(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const emptyTemporal = (literal: string | null = null, warning: string | null = null, precision: TemporalPrecision = "unknown"): TemporalEvidence => ({ literal, start: null, end: null, precision, inferred: false, warning });
const pad = (value: number) => String(value).padStart(2, "0");
function daysInMonth(year: number, month: number) { return month === 2 ? year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28 : [4, 6, 9, 11].includes(month) ? 30 : 31; }
function date(year: number, month: number, day: number) {
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return `${String(year).padStart(4, "0")}-${pad(month)}-${pad(day)}`;
}
function monthNumber(value: string) { return value.toLowerCase() === "setiembre" ? 9 : MONTHS.indexOf(value.toLowerCase()) + 1; }
type DateToken = { index: number; endIndex: number; literal: string; start: string | null; end: string | null; precision: TemporalPrecision; warning: string | null };

/** No file upload date, document date or current clock participates in parsing. */
export function parseFactTemporal(input: string): TemporalEvidence {
  const text = input.slice(0, KNOWLEDGE_EXTRACTION_LIMITS.inputCharacters);
  const tokens: DateToken[] = [];
  const add = (match: RegExpExecArray, start: string | null, end: string | null, precision: TemporalPrecision, warning: string | null = null) => {
    const endIndex = match.index + match[0].length;
    if (!tokens.some(token => match.index < token.endIndex && endIndex > token.index)) tokens.push({ index: match.index, endIndex, literal: match[0], start, end, precision, warning });
  };
  const shortRange = new RegExp(`\\b(?:entre\\s+(?:el\\s+)?|del?\\s+)(\\d{1,2})\\s+(?:y\\s+(?:el\\s+)?|al?\\s+)(\\d{1,2})\\s+(?:de\\s+)?(${MONTH_PATTERN})\\s+(?:de\\s+)?(\\d{4})\\b`, "gi");
  for (const match of text.matchAll(shortRange)) {
    const month = monthNumber(match[3]), start = date(Number(match[4]), month, Number(match[1])), end = date(Number(match[4]), month, Number(match[2]));
    add(match, start && end && start <= end ? start : null, start && end && start <= end ? end : null, start && end && start <= end ? "range" : "unknown", start && end && start <= end ? null : "El rango literal no contiene fechas válidas y ordenadas");
  }
  for (const match of text.matchAll(/(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g)) {
    const value = date(Number(match[1]), Number(match[2]), Number(match[3]));
    add(match, value, value, value ? "day" : "unknown", value ? null : "La fecha literal no es válida");
  }
  const fullSpanish = new RegExp(`\\b(\\d{1,2})\\s+(?:de\\s+)?(${MONTH_PATTERN})\\s+(?:de\\s+)?(\\d{4})\\b`, "gi");
  for (const match of text.matchAll(fullSpanish)) {
    const value = date(Number(match[3]), monthNumber(match[2]), Number(match[1]));
    add(match, value, value, value ? "day" : "unknown", value ? null : "La fecha literal no es válida");
  }
  for (const match of text.matchAll(/(?<!\d)(\d{1,2})\/(\d{1,2})\/(\d{4})(?!\d)/g)) {
    const first = Number(match[1]), second = Number(match[2]), year = Number(match[3]);
    if (first >= 1 && first <= 12 && second >= 1 && second <= 12) add(match, null, null, "ambiguous", "La fecha numérica admite más de un orden de día y mes; requiere revisión");
    else {
      const value = first > 12 ? date(year, second, first) : second > 12 ? date(year, first, second) : null;
      add(match, value, value, value ? "day" : "unknown", value ? null : "La fecha literal no es válida");
    }
  }
  const monthYear = new RegExp(`\\b(${MONTH_PATTERN})\\s+(?:de\\s+)?(\\d{4})\\b`, "gi");
  for (const match of text.matchAll(monthYear)) {
    const year = Number(match[2]), month = monthNumber(match[1]);
    add(match, date(year, month, 1), date(year, month, daysInMonth(year, month)), year ? "month" : "unknown", year ? null : "El año literal no es válido");
  }
  for (const match of text.matchAll(/\b(?:en\s+(?:el\s+)?(?:año\s+)?|durante\s+(?:el\s+)?(?:año\s+)?|año\s+)(\d{4})\b/gi)) {
    const year = Number(match[1]);
    add(match, date(year, 1, 1), date(year, 12, 31), year ? "year" : "unknown", year ? null : "El año literal no es válido");
  }
  if (!tokens.length && /^\s*\d{4}\s*$/.test(text)) {
    const match = /\d{4}/.exec(text)!; const year = Number(match[0]);
    add(match, date(year, 1, 1), date(year, 12, 31), year ? "year" : "unknown", year ? null : "El año literal no es válido");
  }
  tokens.sort((a, b) => a.index - b.index);
  if (!tokens.length) {
    const relative = /\b(?:ayer|hoy|mañana|al día siguiente|la semana pasada|el mes pasado|el próximo mes)\b/i.exec(text);
    return relative ? emptyTemporal(relative[0], "No se normalizan fechas relativas sin una referencia explícita") : emptyTemporal();
  }
  if (tokens.length === 2) {
    const [first, second] = tokens;
    const between = text.slice(first.endIndex, second.index);
    const prefix = text.slice(Math.max(0, first.index - 20), first.index);
    const range = /^\s*(?:y|a|al|hasta|—|–|-)\s*(?:el\s+)?$/i.test(between) && (/(?:entre|desde|del?)\s+(?:el\s+)?$/i.test(prefix) || !text.slice(0, first.index).trim());
    if (range && first.start && second.end && first.start <= second.end) {
      const prefixMatch = /(?:entre|desde|del?)\s+(?:el\s+)?$/i.exec(prefix);
      const offset = prefixMatch ? first.index - prefix.length + prefixMatch.index : first.index;
      return { literal: text.slice(offset, second.endIndex), start: first.start, end: second.end, precision: "range", inferred: false, warning: null };
    }
  }
  if (tokens.length > 1) return emptyTemporal(text.slice(tokens[0].index, tokens.at(-1)!.endIndex), "El pasaje contiene varias referencias temporales; no se elige una automáticamente", "ambiguous");
  const token = tokens[0];
  const prefix = text.slice(Math.max(0, token.index - 40), token.index);
  const qualification = /(?:antes\s+de(?:l)?|después\s+de(?:l)?|a\s+partir\s+de(?:l)?|aproximadamente|alrededor\s+de(?:l)?|cerca\s+de(?:l)?)\s+(?:el\s+)?$/i.exec(prefix);
  if (qualification) return emptyTemporal(text.slice(token.index - prefix.length + qualification.index, token.endIndex), "La referencia temporal está calificada; no se transforma en una fecha exacta");
  return { literal: token.literal, start: token.start, end: token.end, precision: token.precision, inferred: false, warning: token.warning };
}

function decimal(raw: string, currency: FactAmount["currency"]): string | null {
  const signed = raw.replace(/[\s\u00a0\u202f]/g, "").replace("−", "-");
  const negative = signed.startsWith("-"), value = signed.replace(/^[+-]/, "");
  if (!/^\d[\d.,]*$/.test(value) || value.replace(/\D/g, "").length > 24) return null;
  let integer = value, fraction = "";
  const dot = value.lastIndexOf("."), comma = value.lastIndexOf(",");
  if (dot >= 0 && comma >= 0) {
    const separator = dot > comma ? "." : ",", grouping = separator === "." ? "," : ".";
    const pieces = value.split(separator); if (pieces.length !== 2 || !/^\d{1,6}$/.test(pieces[1])) return null;
    if (!new RegExp(`^\\d{1,3}(?:\\${grouping}\\d{3})+$`).test(pieces[0])) return null;
    integer = pieces[0].split(grouping).join(""); fraction = pieces[1];
  } else if (dot >= 0 || comma >= 0) {
    const separator = dot >= 0 ? "." : ",", pieces = value.split(separator);
    if (pieces.length > 2) {
      if (!/^\d{1,3}$/.test(pieces[0]) || !pieces.slice(1).every(piece => /^\d{3}$/.test(piece))) return null;
      integer = pieces.join("");
    } else if (pieces[1].length === 3 && separator === "." && currency === "CLP" && /^\d{1,3}$/.test(pieces[0])) integer = pieces.join("");
    else if (/^\d{1,2}$/.test(pieces[1]) || currency === "UF" && separator === "," && /^\d{1,6}$/.test(pieces[1])) { integer = pieces[0]; fraction = pieces[1]; }
    else return null;
  }
  integer = integer.replace(/^0+(?=\d)/, ""); fraction = fraction.replace(/0+$/, "");
  const result = fraction ? `${integer}.${fraction}` : integer;
  return negative && result !== "0" ? `-${result}` : result;
}
function currency(label: string): FactAmount["currency"] {
  const unit = words(label);
  if (unit === "clp" || unit === "pesos chilenos") return "CLP";
  if (["usd", "us$", "dolares estadounidenses", "dolar estadounidense"].includes(unit)) return "USD";
  if (["eur", "€", "euros", "euro"].includes(unit)) return "EUR";
  if (["uf", "unidades de fomento", "unidad de fomento"].includes(unit)) return "UF";
  return unit.startsWith("peso") ? "unknown-peso" : "unknown-dollar";
}
export function extractFactAmounts(input: string): FactAmount[] {
  const text = input.slice(0, KNOWLEDGE_EXTRACTION_LIMITS.inputCharacters), found: { index: number; end: number; amount: FactAmount }[] = [];
  const add = (match: RegExpExecArray, raw: string, label: string) => {
    const end = match.index + match[0].length; if (found.some(row => match.index < row.end && end > row.index)) return;
    const unit = currency(label), value = decimal(raw, unit);
    const context = words(text.slice(Math.max(0, match.index - 35), end + 20));
    const before = text.slice(Math.max(0, match.index - 4), match.index), after = words(text.slice(end, end + 24));
    const magnitudeOrSignUnclear = /[-−+±]\s*$/.test(before) || /\(\s*$/.test(before) || /^\s*(?:mil(?:es)?|millon(?:es)?|billon(?:es)?|mm|m)\b/.test(after) || /^\s*(?:%|\/\s*\d)/.test(after);
    const qualified = value === null || magnitudeOrSignUnclear || /\b(?:aproximadamente|aprox|alrededor|cerca|entre|hasta|desde|al menos|como minimo|como maximo|menor|mayor|superior|inferior|mas de|menos de)\b/.test(context);
    found.push({ index: match.index, end, amount: { literal: match[0], currency: unit, value, qualified } });
  };
  const number = "[+−-]?\\d(?:[\\d.,]*\\d)?";
  // Explicit full currency labels take precedence over an ambiguous bare symbol.
  for (const match of text.matchAll(new RegExp(`\\b(CLP|USD|EUR|UF)\\s*(${number})(?!\\d|[.,]\\d)`, "gi"))) add(match, match[2], match[1]);
  for (const match of text.matchAll(new RegExp(`(${number})\\s*(pesos chilenos|dólares estadounidenses|dólar estadounidense|unidades de fomento|unidad de fomento|pesos|dólares|dólar|euros|euro|CLP|USD|EUR|UF)\\b`, "gi"))) add(match, match[1], match[2]);
  for (const match of text.matchAll(new RegExp(`(US\\$|\\$|€)\\s*(${number})(?!\\d|[.,]\\d)`, "gi"))) add(match, match[2], match[1]);
  return found.sort((a, b) => a.index - b.index).slice(0, 10).map(row => row.amount);
}

function sentences(text: string) {
  const ranges: string[] = []; let start = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text[index]; const next = text[index + 1];
    const paragraph = char === "\n" && next === "\n";
    const punctuation = /[.!?]/.test(char) && (index === text.length - 1 || /\s/.test(next));
    if (!paragraph && !punctuation) continue;
    if (char === "." && /(?:\b(?:sr|sra|dr|dra|art|núm|num)|\bS\.A|\bS\.p\.A)$/i.test(text.slice(start, index))) continue;
    const piece = text.slice(start, paragraph ? index : index + 1).trim(); if (piece) ranges.push(piece);
    start = index + 1;
    if (ranges.length >= KNOWLEDGE_EXTRACTION_LIMITS.sentences) break;
  }
  if (ranges.length < KNOWLEDGE_EXTRACTION_LIMITS.sentences) { const piece = text.slice(start).trim(); if (piece) ranges.push(piece); }
  return ranges;
}

export function analyzeEvidenceFragment(fragment: EvidenceFragmentInput, options: { maxProposals?: number } = {}) {
  if (typeof fragment.text !== "string") throw new TypeError("El fragmento debe contener texto");
  const fragmentId = fragment.fragmentId || fragment.id || "";
  const max = options.maxProposals ?? KNOWLEDGE_EXTRACTION_LIMITS.proposals;
  if (!Number.isSafeInteger(max) || max < 1 || max > KNOWLEDGE_EXTRACTION_LIMITS.proposals) throw new RangeError("Límite de propuestas inválido");
  const text = fragment.text.slice(0, KNOWLEDGE_EXTRACTION_LIMITS.inputCharacters);
  const warnings: string[] = [], proposals: FactProposal[] = [], fingerprints = new Set<string>();
  let limited = fragment.text.length > text.length;
  const candidates = sentences(text);
  if (candidates.length === KNOWLEDGE_EXTRACTION_LIMITS.sentences) limited = true;
  for (const quote of candidates) {
    if (quote.length > KNOWLEDGE_EXTRACTION_LIMITS.quoteCharacters) { limited = true; continue; }
    if (quote.length < 12 || /[?¿]/.test(quote)) continue;
    const normalized = words(quote);
    if (/\b(?:si ocurriera|hipotetic|por ejemplo|podria|podra|deberia|debera)\b/.test(normalized)) continue;
    if (!/\b(?:pago|pagaron|pagado|pagada|firmo|firmado|firmada|firma|suscribio|suscrito|entrego|entregado|notifico|notificado|celebro|celebrado|ocurrio|realizo|realizado|emitio|emitido|recibio|recibido|audiencia|despido|despidio|deposito|depositado|transferencia|transfirio|transferido|adeuda|adeudado|saldo|monto|importe|remuneracion|deuda|condeno|condenado|resolvio|ordeno)\b/.test(normalized)) continue;
    const temporal = parseFactTemporal(quote), amounts = extractFactAmounts(quote);
    if (!temporal.literal && !amounts.length) continue;
    const fingerprint = hash(`fact\0${normalize(quote)}`);
    if (fingerprints.has(fingerprint)) continue;
    fingerprints.add(fingerprint);
    if (proposals.length === max) { limited = true; break; }
    proposals.push({ fragmentId, statement: quote, quote, fingerprint, temporal, amounts, comparisonKey: null });
  }
  if (limited) warnings.push("La propuesta se acotó por el límite de texto, sentencias o hechos; no acredita una revisión exhaustiva del fragmento");
  return { proposals, limited, warnings };
}
export function extractFactProposals(fragment: EvidenceFragmentInput, options: { maxProposals?: number } = {}) { return analyzeEvidenceFragment(fragment, options).proposals; }

function isCalendarDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return date(Number(value.slice(0, 4)), Number(value.slice(5, 7)), Number(value.slice(8, 10))) === value;
}
function comparableTemporal(value: TemporalEvidence) { return isCalendarDate(value.start) && isCalendarDate(value.end) && value.start! <= value.end! && ["day", "month", "year", "range"].includes(value.precision) && !value.warning; }
function monetaryBasis(text: string) {
  const value = words(text), basis: string[] = [];
  const patterns: Record<string, string> = { mensual: "mensual(?:es)?", anual: "anual(?:es)?", diario: "diari[oa]s?", semanal: "semanal(?:es)?", hora: "horas?", total: "total(?:es)?", cuota: "cuotas?", saldo: "saldos?", parcial: "parcial(?:es)?", capital: "capital", intereses: "interes(?:es)?", bruto: "brut[oa]s?", liquido: "liquid[oa]s?" };
  for (const [name, pattern] of Object.entries(patterns)) if (new RegExp(`\\b(?:${pattern})\\b`).test(value)) basis.push(name);
  // A named month without a year is still a distinct payment period.
  for (const month of [...MONTHS, "setiembre"]) if (new RegExp(`\\b${month}\\b`).test(value)) basis.push(`mes:${month === "setiembre" ? "septiembre" : month}`);
  const halfYear = /\b(primer|primero|segundo|1|2)\s*(?:er|do)?\s*semestre\b/.exec(value); if (halfYear) basis.push(`semestre:${halfYear[1]}`);
  const installment = /\bcuota\s+(?:n[°ºo.]?\s*)?(\d+)\b/.exec(value); if (installment) basis.push(`cuota:${installment[1]}`);
  if (/\b(?:incluye|incluido|con)\s+iva\b/.test(value)) basis.push("iva-incluido");
  if (/\b(?:mas|sin|excluye)\s+iva\b/.test(value)) basis.push("iva-excluido");
  return basis.sort().join("|");
}
const negation = (statement: string) => /\b(?:no|nunca|jamas|niega|nego|sin|tampoco)\b/.test(words(statement));

/** A human comparison key is required; lexical resemblance does not group facts. */
export function detectPotentialContradictions(facts: ComparableFact[]): PotentialContradiction[] {
  if (facts.length > KNOWLEDGE_EXTRACTION_LIMITS.comparisonFacts) throw new RangeError("Acote los hechos antes de compararlos");
  const results: PotentialContradiction[] = [], seen = new Set<string>();
  const ordered = facts.filter(fact => fact.statement.length <= KNOWLEDGE_EXTRACTION_LIMITS.comparisonStatementCharacters).map(fact => ({
    ...fact, comparison: normalize(fact.comparisonKey || ""), negative: negation(fact.statement),
    parsedTemporal: fact.temporal || parseFactTemporal(fact.statement), parsedAmounts: fact.amounts || extractFactAmounts(fact.statement), basis: monetaryBasis(fact.statement),
  })).sort((a, b) => a.id.localeCompare(b.id));
  const add = (left: ComparableFact, right: ComparableFact, kind: PotentialContradiction["kind"], reason: string, values: string) => {
    const fingerprint = hash(JSON.stringify([left.id, right.id, normalize(left.comparisonKey!), kind, values]));
    if (seen.has(fingerprint) || results.length === KNOWLEDGE_EXTRACTION_LIMITS.contradictions) return;
    seen.add(fingerprint); results.push({ leftFactId: left.id, rightFactId: right.id, kind, reason, status: "proposed", fingerprint });
  };
  for (let leftIndex = 0; leftIndex < ordered.length; leftIndex++) {
    const left = ordered[leftIndex]; if (!left.id || !left.comparison || left.negative) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < ordered.length; rightIndex++) {
      const right = ordered[rightIndex];
      if (left.id === right.id || !right.comparison || left.comparison !== right.comparison || right.negative) continue;
      const a = left.parsedTemporal, b = right.parsedTemporal;
      if (comparableTemporal(a) && comparableTemporal(b) && (a.end! < b.start! || b.end! < a.start!)) add(left, right, "date", `La misma clave de comparación conserva intervalos temporales sin intersección: «${a.literal}» y «${b.literal}». Es una posible discrepancia y requiere revisar ambos pasajes.`, JSON.stringify([a.start, a.end, b.start, b.end]));
      const leftAmounts = left.parsedAmounts, rightAmounts = right.parsedAmounts;
      if (leftAmounts.length !== 1 || rightAmounts.length !== 1 || left.basis !== right.basis) continue;
      const x = leftAmounts[0], y = rightAmounts[0];
      if (!x.value || !y.value || x.qualified || y.qualified || x.currency.startsWith("unknown-") || x.currency !== y.currency || x.value === y.value) continue;
      // Distinct or only partially described periods may represent separate payments.
      const noDates = !a.literal && !b.literal;
      const samePeriod = comparableTemporal(a) && comparableTemporal(b) && a.start === b.start && a.end === b.end && a.precision === b.precision;
      if (!noDates && !samePeriod) continue;
      add(left, right, "money", `La misma clave de comparación conserva montos distintos en ${x.currency}: «${x.literal}» y «${y.literal}». No se identificó un periodo o base distintos; la incompatibilidad requiere revisión de los dos pasajes.`, JSON.stringify([x.currency, x.value, y.value, a.start, a.end, left.basis]));
    }
  }
  return results;
}
