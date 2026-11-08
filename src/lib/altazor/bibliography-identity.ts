import type { BibliographyMetadata } from "./bibliography-types";

/** ISBN check digits follow the International ISBN Agency's ISBN Users' Manual. */
export function normalizeIsbn(raw: string) {
  let isbn = raw.trim().replace(/^ISBN(?:-1[03])?\s*:?\s*/i, "").replace(/[\s-]/g, "").toUpperCase();
  if (/^\d{9}[\dX]$/.test(isbn)) {
    if ([...isbn].reduce((sum, digit, index) => sum + (digit === "X" ? 10 : Number(digit)) * (10 - index), 0) % 11) throw Error("ISBN inválido");
    const prefix = "978" + isbn.slice(0, 9);
    isbn = prefix + ((10 - [...prefix].reduce((sum, digit, index) => sum + Number(digit) * (index % 2 ? 3 : 1), 0) % 10) % 10);
  }
  if (!/^97[89]\d{10}$/.test(isbn) || [...isbn].reduce((sum, digit, index) => sum + Number(digit) * (index % 2 ? 3 : 1), 0) % 10) throw Error("ISBN inválido");
  return isbn;
}
const normalized = (value: string) => value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("es").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
function authorKey(metadata: BibliographyMetadata) {
  return metadata.authors.map(author => normalized(author.family ? `${author.family} ${author.given}` : author.name).split(" ").filter(Boolean).sort().join(" ")).join("|");
}
/** Conservative fallback; conflicting editions/identifiers must remain distinct. */
export function sameBibliographyWork(left: BibliographyMetadata, right: BibliographyMetadata) {
  let identified = false;
  for (const field of ["doi", "isbn", "openalexId"] as const) {
    const a = left[field], b = right[field];
    if (!a || !b) continue;
    if ((field === "isbn" ? normalizeIsbn(a) !== normalizeIsbn(b) : a !== b)) return false;
    identified = true;
  }
  if (identified) return true;
  if (left.type !== right.type || !left.year || left.year !== right.year || !left.authors.length || !right.authors.length) return false;
  if (normalized(left.title) !== normalized(right.title) || authorKey(left) !== authorKey(right)) return false;
  return (["volume", "issue", "pages", "publisher"] as const).every(field => !left[field] || !right[field] || normalized(left[field]) === normalized(right[field]));
}
