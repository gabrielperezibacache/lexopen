import type { BookSourceType, JudicialMetadata } from "./judicial";

type ReferenceSource = { title: string; author?: string; year?: string; edition?: string; publisher?: string; sourceType?: BookSourceType; judicial?: JudicialMetadata | null };
const clean = (value: string) => value.replace(/[\r\n\[\]<>`]/g, " ").trim();
export const judicialMetadataNotice = "Los datos judiciales fueron ingresados manualmente. La corroboración del pasaje no acredita autenticidad, firmeza ni ejecutoria de la resolución.";

/** Shared by the reader, AI context and exports so a tribunal is never rendered as a book author. */
export function formatBookReference(source: ReferenceSource): string {
  if (source.sourceType && source.sourceType !== "book") {
    const judicial = source.judicial;
    if (!judicial) return [source.sourceType === "judgment" ? "Sentencia" : "Resolución", source.title, "Datos judiciales no disponibles"].map(clean).join(". ");
    const date = judicial.decisionDate.split("-").reverse().join("/");
    return [judicial.court, judicial.chamber, source.sourceType === "judgment" ? "Sentencia" : "Resolución", `Rol ${judicial.caseNumber}`, judicial.rit && `RIT ${judicial.rit}`, judicial.ruc && `RUC ${judicial.ruc}`, date, judicial.caseTitle || source.title, judicial.matter, judicial.jurisdiction !== "CL" && judicial.jurisdiction].filter((value): value is string => typeof value === "string" && Boolean(value)).map(clean).join(". ");
  }
  return [source.author || "Autor no indicado", source.title, source.edition, source.publisher, source.year].filter((value): value is string => typeof value === "string" && Boolean(value)).map(clean).join(". ");
}
