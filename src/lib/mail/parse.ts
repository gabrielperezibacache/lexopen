/** Parse PJUD / court notification email bodies for RIT, tribunal and tabla hints. */
import { extractRitsFromText, isPlaceholderTribunal, normalizeTribunalLabel } from "@/lib/pjud/ojv-dom";

export type MailKind = "resolucion" | "causa_general" | "tablas" | "otro";

export type ParsedMail = {
  kind: MailKind;
  rit?: string;
  tribunal?: string;
  resolucion?: string;
  tablaFecha?: string;
  tablaSala?: string;
  tablaNota?: string;
};

const TRIBUNAL_RE =
  /(?:tribunal|juzgado|corte)\s*(?:de\s*)?(?:letras|civil|apelaciones)?\s*[:\-]?\s*([^\n\r,;]{4,80})/i;

const RESOLUCION_RE =
  /(?:resoluci[oó]n|prove[ií]do|sentencia|auto)\s*[:\-]?\s*([^\n\r]{8,240})/i;

const TABLA_FECHA_RE =
  /(?:tabla|audiencia|comparendo)\s*(?:para\s*)?(?:el\s*)?(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/i;

const TABLA_SALA_RE = /(?:sala|rol)\s*[:\-]?\s*([^\n\r,;]{2,40})/i;

export function normalizeRit(raw: string): string {
  const compact = raw.replace(/\s+/g, "").toUpperCase();
  const withDashes = compact.replace(/^([CD])(\d+)(\d{4})$/, "$1-$2-$3");
  const m = withDashes.match(/^([CD])-?(\d+)-(\d{4})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const m2 = compact.match(/^(\d+)-?(\d{4})$/);
  if (m2) return `${m2[1]}-${m2[2]}`;
  return withDashes;
}

export function flattenMimeText(parts: string[]): string {
  return parts
    .map((p) => p.replace(/\r\n/g, "\n").trim())
    .filter(Boolean)
    .join("\n\n");
}

export function classifyMailSubject(subject: string, body: string): MailKind {
  const s = `${subject}\n${body}`.toLowerCase();
  if (/horario\s+de\s+tabla|tabla\s+de\s+causas|causa\s+en\s+tabla|comparendo/.test(s)) {
    return "tablas";
  }
  if (/resoluci[oó]n|prove[ií]do|sentencia/.test(s)) {
    return "resolucion";
  }
  if (/\baudiencia\b/.test(s)) return "tablas";
  if (/\b(?:causa|rit|ruc|rol|notificaci[oó]n)\b/.test(s)) {
    return "causa_general";
  }
  return "otro";
}

function caseIdentifiers(text: string) {
  const typed = extractRitsFromText(text).filter(value => /^[A-Z]/.test(value));
  const labelledRoles = Array.from(text.matchAll(/\b(?:RIT|ROL)(?:[\t ]+N[°º.]?)?[\t ]*:?\s*(\d{1,6}-\d{4})(?![A-Z0-9-])/gi), match => match[1]!);
  return [...new Set([...typed, ...labelledRoles])];
}

export function mailCourtKey(tribunal: string) {
  return normalizeTribunalLabel(tribunal.replace(/(\d)[°º]/g, "$1"));
}

export type ExactMailMatter = { rit: string; courtKey: string };

/** Automatic filing requires a single case identifier and a court named explicitly. */
export function parseExactMailMatter(subject: string, body: string): ExactMailMatter | null {
  const text = flattenMimeText([subject, body]);
  const identifiers = caseIdentifiers(text);
  const courts = new Set(Array.from(text.matchAll(/^[\t ]*(?:tribunal|juzgado|corte)[\t ]*:[\t ]*([^\r\n]{4,180})$/gim), match => match[1]!.trim())
    .filter(tribunal => !isPlaceholderTribunal(tribunal)).map(mailCourtKey));
  if (identifiers.length !== 1 || courts.size !== 1) return null;
  return { rit: identifiers[0]!, courtKey: [...courts][0]! };
}

export function parseMailContent(subject: string, body: string): ParsedMail {
  const text = flattenMimeText([subject, body]);
  const kind = classifyMailSubject(subject, body);
  const identifiers = caseIdentifiers(text);
  const tribunalMatch = text.match(TRIBUNAL_RE);
  const resMatch = body.match(RESOLUCION_RE);
  const tablaFechaMatch = text.match(TABLA_FECHA_RE);
  const tablaSalaMatch = text.match(TABLA_SALA_RE);

  return {
    kind,
    rit: identifiers.length === 1 ? identifiers[0] : undefined,
    tribunal: tribunalMatch?.[1]?.trim(),
    resolucion: resMatch?.[1]?.trim(),
    tablaFecha: tablaFechaMatch?.[1]?.trim(),
    tablaSala: tablaSalaMatch?.[1]?.trim(),
    tablaNota:
      kind === "tablas"
        ? [tablaFechaMatch?.[1], tablaSalaMatch?.[1]].filter(Boolean).join(" · ")
        : undefined,
  };
}
