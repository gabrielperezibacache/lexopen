import { bibliographyMetadataSchema, doiHref, missingBibliographyFields, type BibliographyMetadata, type BibliographyStyle } from "./bibliography-types";

const plain = (value: string) => value.replace(/[\r\n\x00-\x1f]+/g, " ").replace(/\s+/g, " ").trim();
const initials = (value: string, dots = true) => value.split(/[\s-]+/).filter(Boolean).map(part => [...part][0].toUpperCase() + (dots ? "." : "")).join(dots ? " " : "");
function names(metadata: BibliographyMetadata, style: BibliographyStyle) {
  if (!metadata.authors.length) return "[autor no informado]";
  const authors = metadata.authors.map(author => {
    if (!author.family) return author.name;
    if (style === "vancouver") return `${author.family} ${initials(author.given, false)}`.trim();
    if (style === "ieee") return `${initials(author.given)} ${author.family}`.trim();
    if (style === "chicago" || style === "mla") return [author.family, author.given].filter(Boolean).join(", ");
    return [author.family, initials(author.given)].filter(Boolean).join(", ");
  });
  if (style === "apa") return authors.length > 20 ? `${authors.slice(0, 19).join(", ")}, … ${authors.at(-1)}` : authors.length === 1 ? authors[0] : `${authors.slice(0, -1).join(", ")}, & ${authors.at(-1)}`;
  if (style === "ieee") return authors.length > 6 ? `${authors[0]} et al.` : authors.length === 1 ? authors[0] : `${authors.slice(0, -1).join(", ")}, and ${authors.at(-1)}`;
  if (style === "mla" && authors.length > 2) return `${authors[0]}, et al.`;
  return authors.join(style === "vancouver" ? ", " : "; ");
}
function identifier(metadata: BibliographyMetadata) { return metadata.doi ? doiHref(metadata.doi) : metadata.openalexId ? `https://openalex.org/${metadata.openalexId}` : ""; }
const punctuate = (value: string) => !value ? "" : /[.!?]$/.test(value) ? value : value + ".";
function tex(value: string) { return plain(value).replace(/[\\{}%&#_$]/g, char => char === "\\" ? "\\textbackslash{}" : `\\${char}`); }
export function formatBibliography(metadataInput: BibliographyMetadata, style: BibliographyStyle, index = 1) {
  const metadata = bibliographyMetadataSchema.parse(metadataInput), author = names(metadata, style), date = metadata.year ? String(metadata.year) : "s. f.", link = identifier(metadata), journal = plain(metadata.containerTitle), title = plain(metadata.title), pages = plain(metadata.pages), volume = plain(metadata.volume), issue = plain(metadata.issue);
  let text: string;
  if (style === "bibtex") {
    const key = `lexopen${metadata.year || "nd"}_${index}`, fields: [string, string][] = [["title", title], ["author", metadata.authors.map(value => value.family ? [value.family, value.given].filter(Boolean).join(", ") : value.name).join(" and ")], ["year", metadata.year ? String(metadata.year) : ""], [metadata.type === "book" ? "publisher" : metadata.type === "chapter" ? "booktitle" : "journal", metadata.type === "book" ? metadata.publisher : journal], ["volume", volume], ["number", issue], ["pages", pages], ["doi", metadata.doi]];
    text = `@${metadata.type === "book" ? "book" : metadata.type === "chapter" ? "incollection" : "article"}{${key},\n${fields.filter(([, value]) => value).map(([field, value]) => `  ${field} = {${tex(value)}}`).join(",\n")}\n}`;
  } else if (style === "ris") {
    const fields: [string, string][] = [["TY", metadata.type === "book" ? "BOOK" : metadata.type === "chapter" ? "CHAP" : "JOUR"], ["TI", title], ...metadata.authors.map(value => ["AU", value.family ? [value.family, value.given].filter(Boolean).join(", ") : value.name] as [string, string]), ["PY", metadata.year ? String(metadata.year) : ""], ["JO", journal], ["VL", volume], ["IS", issue], ["SP", pages], ["PB", metadata.publisher], ["DO", metadata.doi], ["UR", link]];
    text = fields.filter(([, value]) => value).map(([field, value]) => `${field}  - ${plain(value)}`).join("\n") + "\nER  - \n";
  } else if (style === "apa") text = `${punctuate(author)} (${date}). ${punctuate(title)} ${metadata.type === "book" ? punctuate(metadata.publisher) : [journal, volume ? `${volume}${issue ? `(${issue})` : ""}` : issue ? `(${issue})` : "", pages].filter(Boolean).join(", ") + (journal || volume || pages ? "." : "")} ${link}`.trim();
  else if (style === "ieee") text = `[${index}] ${author}, “${title},” ${[metadata.type === "book" ? metadata.publisher : journal, volume && `vol. ${volume}`, issue && `no. ${issue}`, pages && `pp. ${pages}`, date].filter(Boolean).join(", ")}.${link ? ` doi: ${metadata.doi || link}.` : ""}`;
  else if (style === "vancouver") text = `${punctuate(author)} ${punctuate(title)} ${metadata.type === "book" ? `${metadata.publisher ? `${metadata.publisher}; ` : ""}${date}.` : `${journal ? journal + ". " : ""}${date}${volume ? ";" + volume : ""}${issue ? "(" + issue + ")" : ""}${pages ? ":" + pages : ""}.`}${link ? ` ${link}` : ""}`;
  else if (style === "chicago") text = `${punctuate(author)} ${metadata.type === "book" ? `${punctuate(title)} ${metadata.publisher ? metadata.publisher + ", " : ""}${date}.` : `“${title}.” ${journal}${volume ? " " + volume : ""}${issue ? ", no. " + issue : ""} (${date})${pages ? ": " + pages : ""}.`}${link ? " " + link : ""}`;
  else text = `${punctuate(author)} “${title}.” ${[metadata.type === "book" ? metadata.publisher : journal, volume && "vol. " + volume, issue && "no. " + issue, date, pages && "pp. " + pages].filter(Boolean).join(", ")}.${link ? " " + link : ""}`;
  return { text, missingFields: missingBibliographyFields(metadata), warnings: [...metadata.warnings, ...(metadata.type === "chapter" || metadata.type === "other" ? ["Referencia de estructura especial: revise editores, obra contenedora y reglas del estilo antes de entregarla."] : [])], style };
}
function author(value: string) { const cleaned = plain(value), comma = cleaned.indexOf(","); return comma > 0 ? { family: cleaned.slice(0, comma).trim(), given: cleaned.slice(comma + 1).trim(), name: "" } : { family: "", given: "", name: cleaned }; }
function base(fields: Record<string, string>, authors: string[], type: string): BibliographyMetadata {
  const parsed = Number((fields.year || "").slice(0, 4));
  return bibliographyMetadataSchema.parse({ title: fields.title, authors: authors.filter(Boolean).slice(0, 50).map(author), year: Number.isInteger(parsed) && parsed >= 1000 && parsed <= 2200 ? parsed : null, containerTitle: fields.journal || fields.booktitle || "", publisher: fields.publisher || "", volume: fields.volume || "", issue: fields.number || "", pages: fields.pages || "", doi: fields.doi || "", type: /book/i.test(type) ? "book" : /chap|incollection/i.test(type) ? "chapter" : "article", warnings: ["Metadatos importados por el profesional; no corroborados contra un registro externo."] });
}
/** Import only data, never resolves macros, follows URLs or executes TeX. */
export function importBibliography(text: string, format: "ris" | "bibtex" | "json"): BibliographyMetadata[] {
  if (Buffer.byteLength(text, "utf8") > 256 * 1024 || text.includes("\0")) throw new Error("La bibliografía supera 256 KiB o contiene datos binarios");
  if (format === "json") { const data = JSON.parse(text); return bibliographyMetadataSchema.array().min(1).max(100).parse(data); }
  const results: BibliographyMetadata[] = [];
  if (format === "ris") {
    let fields: Record<string, string> | null = null, authors: string[] = [];
    for (const line of text.replace(/\r/g, "").split("\n")) {
      if (!line.trim()) continue;
      const match = /^([A-Z0-9]{2})  - ?(.*)$/.exec(line); if (!match) throw new Error("RIS no válido: revise las etiquetas de dos letras");
      const [, tag, value] = match;
      if (tag === "TY") { if (fields) throw new Error("RIS contiene un registro sin cierre ER"); fields = { type: value }; authors = []; }
      else if (!fields) throw new Error("RIS debe comenzar con TY");
      else if (tag === "ER") { results.push(base(fields, authors, fields.type)); fields = null; }
      else if (tag === "AU" || tag === "A1") authors.push(value);
      else { const key: Record<string, string> = { TI: "title", T1: "title", PY: "year", Y1: "year", JO: "journal", JF: "journal", T2: "journal", VL: "volume", IS: "number", SP: "pages", EP: "endPage", PB: "publisher", DO: "doi" }; if (key[tag]) { if (tag === "EP") fields.pages = fields.pages ? `${fields.pages}-${value}` : value; else fields[key[tag]] = value; } }
      if (results.length > 100 || authors.length > 50) throw new Error("La importación admite cien referencias y cincuenta autores por referencia");
    }
    if (fields) throw new Error("RIS contiene un registro sin cierre ER");
  } else {
    let position = 0;
    const whitespace = () => { while (position < text.length && /[\s,]/.test(text[position])) position++; };
    const balanced = () => { const start = ++position; let depth = 1, escaped = false; for (; position < text.length; position++) { const char = text[position]; if (escaped) { escaped = false; continue; } if (char === "\\") { escaped = true; continue; } if (char === "{") depth++; if (char === "}" && --depth === 0) { const value = text.slice(start, position); position++; return value; } } throw new Error("BibTeX tiene llaves sin cerrar"); };
    while (position < text.length) {
      whitespace(); if (position >= text.length) break;
      const header = /^@(article|book|incollection|inproceedings|misc)\s*\{/i.exec(text.slice(position)); if (!header) throw new Error("BibTeX admite article, book, incollection, inproceedings y misc; no evalúa macros");
      position += header[0].length; const comma = text.indexOf(",", position); if (comma < position || comma - position > 200) throw new Error("Clave BibTeX inválida"); position = comma + 1;
      const fields: Record<string, string> = {};
      for (;;) {
        whitespace(); if (text[position] === "}") { position++; break; }
        const key = /^([A-Za-z][A-Za-z0-9_-]*)\s*=\s*/.exec(text.slice(position)); if (!key) throw new Error("Campo BibTeX inválido"); position += key[0].length;
        let value = "";
        if (text[position] === "{") value = balanced();
        else if (text[position] === '"') { position++; let escaped = false, closed = false; for (; position < text.length; position++) { const char = text[position]; if (!escaped && char === '"') { position++; closed = true; break; } value += char; escaped = !escaped && char === "\\"; } if (!closed) throw new Error("Comillas BibTeX sin cerrar"); }
        else { const number = /^\d{1,4}/.exec(text.slice(position)); if (!number) throw new Error("BibTeX no evalúa macros ni concatenaciones"); value = number[0]; position += value.length; }
        if (text[position] !== "," && text[position] !== "}" && !/\s/.test(text[position] || "")) throw new Error("BibTeX no evalúa concatenaciones");
        fields[key[1].toLowerCase()] = value.replace(/\\([{}%&#_$])/g, "$1").replace(/[{}]/g, "").trim();
      }
      results.push(base(fields, (fields.author || "").split(/\s+and\s+/i), header[1])); if (results.length > 100) throw new Error("La importación admite cien referencias");
    }
  }
  if (!results.length) throw new Error("No se encontraron referencias"); return results;
}
