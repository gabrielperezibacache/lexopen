import assert from "node:assert/strict";
import { normalizeIsbn, sameBibliographyWork } from "./bibliography-identity";
import { bibliographyMetadataSchema } from "./bibliography-types";
import { formatBibliography, importBibliography } from "./bibliography";
assert.equal(normalizeIsbn("ISBN-10: 0-306-40615-2"), "9780306406157");
assert.equal(normalizeIsbn("978-0-306-40615-7"), "9780306406157");
assert.equal(normalizeIsbn("0-8044-2957-X"), "9780804429573");
for (const value of ["9780306406158", "0306406153", "abc", "1234567890128"]) assert.throws(() => normalizeIsbn(value));
const metadata = bibliographyMetadataSchema.parse({ title: "Título ficticio: prueba", authors: [{ family: "Pérez", given: "Ana" }], year: 2026, type: "book", publisher: "Editorial ficticia", isbn: "0-306-40615-2" });
assert.ok(sameBibliographyWork(metadata, { ...metadata, isbn: "9780306406157" }));
assert.ok(sameBibliographyWork({ ...metadata, isbn: undefined }, { ...metadata, isbn: undefined, title: "TITULO FICTICIO — PRUEBA", authors: [{ name: "Ana Perez", family: "", given: "" }] }));
assert.equal(sameBibliographyWork(metadata, { ...metadata, isbn: "9780131103627" }), false);
assert.equal(sameBibliographyWork({ ...metadata, doi: "10.5555/same" }, { ...metadata, doi: "10.5555/same", isbn: "9780131103627" }), false);
assert.equal(sameBibliographyWork({ ...metadata, isbn: undefined }, { ...metadata, isbn: undefined, year: 2025 }), false);
assert.equal(sameBibliographyWork({ ...metadata, isbn: undefined, authors: [] }, { ...metadata, isbn: undefined }), false);
assert.equal(sameBibliographyWork({ ...metadata, doi: "10.5555/one" }, { ...metadata, doi: "10.5555/two" }), false);
for (const format of ["ris", "bibtex"] as const) {
  const rendered = formatBibliography(metadata, format).text;
  assert.equal(normalizeIsbn(importBibliography(rendered, format)[0].isbn!), "9780306406157");
}
// RIS SN contains an ISSN for journals; it must not be validated as a book ISBN.
const journal = importBibliography("TY  - JOUR\nTI  - Artículo ficticio\nAU  - Pérez, Ana\nPY  - 2026\nSN  - 1234-5678\nER  - \n", "ris")[0];
assert.equal(journal.type, "article"); assert.equal(journal.isbn, undefined);
console.log("Bibliography identity passed: ISBN-10/13 check digits and interchange, exact title/author/year fallback, conflicting identifiers and incomplete metadata kept distinct.");
