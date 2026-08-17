/** Parse PJUD / court notification email bodies for RIT, tribunal and tabla hints. */

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

const RIT_RE =
  /\b([CD][-\s]?\d{1,5}[-\s]?\d{4}|\d{1,5}[-\s]?\d{4})\b/i;

const TRIBUNAL_RE =
  /(?:tribunal|juzgado|corte)\s*(?:de\s*)?(?:letras|civil|apelaciones)?\s*[:\-]?\s*([^\n\r,;]{4,80})/i;

const RESOLUCION_RE =
  /(?:resoluci[oó]n|prove[ií]do|auto)\s*[:\-]?\s*([^\n\r]{8,240})/i;

const TABLA_FECHA_RE =
  /(?:tabla|audiencia|comparendo)\s*(?:para\s*)?(?:el\s*)?(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/i;

const TABLA_SALA_RE = /(?:sala|rol)\s*[:\-]?\s*([^\n\r,;]{2,40})/i;

export function normalizeRit(raw: string): string {
  const compact = raw.replace(/\s+/g, "").toUpperCase();
  const withDashes = compact.replace(/^([CD])(\d+)(\d{4})$/, "$1-$2-$3");
  const m = withDashes.match(/^([CD])-?(\d+)-(\d{4})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const m2 = compact.match(/^(\d+)-?(\d{4})$/);
  if (m2) return `C-${m2[1]}-${m2[2]}`;
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
  if (/resoluci[oó]n|prove[ií]do|notificaci[oó]n\s+resoluci/.test(s)) {
    return "resolucion";
  }
  if (/causa|rit|ruc|rol\s+único/.test(s)) {
    return "causa_general";
  }
  return "otro";
}

export function parseMailContent(subject: string, body: string): ParsedMail {
  const text = flattenMimeText([subject, body]);
  const kind = classifyMailSubject(subject, body);
  const ritMatch = text.match(RIT_RE);
  const tribunalMatch = text.match(TRIBUNAL_RE);
  const resMatch = body.match(RESOLUCION_RE);
  const tablaFechaMatch = text.match(TABLA_FECHA_RE);
  const tablaSalaMatch = text.match(TABLA_SALA_RE);

  return {
    kind,
    rit: ritMatch ? normalizeRit(ritMatch[1]) : undefined,
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
