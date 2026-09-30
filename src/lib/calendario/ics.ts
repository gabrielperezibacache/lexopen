/** Export ICS (RFC 5545) para eventos/audiencias — un archivo, sin dependencias externas. */

export type IcsEvento = {
  id: string;
  titulo: string;
  inicio: Date;
  fin?: Date | null;
  todoElDia?: boolean;
  lugar?: string | null;
  notas?: string | null;
  updatedAt?: Date | null;
};

function icsEscape(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function foldLine(line: string): string {
  // RFC 5545: líneas ≤ 75 octetos; continuación con espacio inicial.
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    chunks.push(rest.slice(0, 75));
    rest = ` ${rest.slice(75)}`;
  }
  chunks.push(rest);
  return chunks.join("\r\n");
}

function formatUtcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

/** Serializa un `VCALENDAR` con un `VEVENT` por elemento de `eventos`. */
export function buildIcs(eventos: IcsEvento[]): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LexOpen//Asistente//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const evento of eventos) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${evento.id}@lexopen`);
    lines.push(`DTSTAMP:${formatUtcStamp(evento.updatedAt || new Date())}`);
    if (evento.todoElDia) {
      lines.push(`DTSTART;VALUE=DATE:${formatDateOnly(evento.inicio)}`);
      const fin = evento.fin || new Date(evento.inicio.getTime() + 24 * 60 * 60 * 1000);
      lines.push(`DTEND;VALUE=DATE:${formatDateOnly(fin)}`);
    } else {
      lines.push(`DTSTART:${formatUtcStamp(evento.inicio)}`);
      if (evento.fin) lines.push(`DTEND:${formatUtcStamp(evento.fin)}`);
    }
    lines.push(foldLine(`SUMMARY:${icsEscape(evento.titulo)}`));
    if (evento.lugar) lines.push(foldLine(`LOCATION:${icsEscape(evento.lugar)}`));
    if (evento.notas) lines.push(foldLine(`DESCRIPTION:${icsEscape(evento.notas)}`));
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
