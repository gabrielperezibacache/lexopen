import { citationText } from "./citations";
import type { HearingBriefInput } from "./schemas";
import type { HearingNoteView } from "./types";

type AvailableNote = Extract<HearingNoteView, { available: true }>;

/** Receives only notes freshly checked by exportHearingBrief, in the chosen order. */
export function renderHearingBrief(title: string, notes: AvailableNote[], input: Pick<HearingBriefInput, "opening" | "closing">) {
  let reference = 0;
  const references: string[] = [];
  const points = notes.map((note, index) => {
    const marker = note.citation ? `[${++reference}]` : "Sin respaldo de fuente";
    if (note.citation) references.push(citationText(note.citation, reference - 1));
    return `${index + 1}. ${note.title}\nObservación del profesional · ${marker}\n${note.body}`;
  });
  return {
    name: "guion-intervencion.txt",
    text: [
      `Guion de intervención\n${title}`,
      "Borrador de trabajo del profesional. No constituye un escrito presentado ni una conclusión jurídica corroborada. Preparado sin llamar a IA.",
      input.opening && `Apertura\nTexto propio del profesional\n${input.opening}`,
      `Orden de intervención\n\n${points.join("\n\n")}`,
      input.closing && `Petición de cierre\nTexto propio del profesional\n${input.closing}`,
      references.length ? `Respaldos cotejados al generar el guion\n\n${references.join("\n\n")}` : "Este guion contiene únicamente notas personales sin respaldo de fuente.",
      "Revise la suficiencia del respaldo, el razonamiento y la vigencia jurídica antes de utilizarlo. La corroboración de una cita permite volver al pasaje conservado; no valida las observaciones del profesional.",
    ].filter(Boolean).join("\n\n"),
    noteCount: notes.length,
    citationCount: references.length,
  };
}
