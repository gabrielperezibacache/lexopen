import assert from "node:assert/strict";
import { caseBookWritingHref, caseLibraryHref, libraryBookHref, withCaseBookContext } from "./workflow-links";

const returnTo = "/mis-causas?q=pago&page=3#causa-case-1";
const active = new URLSearchParams({ mesa: "desk-1", volver: returnTo, q: "búsqueda de otra pantalla" });
const origin = "https://lexopen.test";
const read = new URL(withCaseBookContext("/biblioteca/book-1?fragment=7#fragment-7", "case-1", "draft-1", active), origin);
assert.equal(read.pathname, "/biblioteca/book-1");
assert.equal(read.hash, "#fragment-7");
assert.deepEqual(Object.fromEntries(read.searchParams), { fragment: "7", causa: "case-1", escrito: "draft-1", mesa: "desk-1", volver: returnTo });
const write = new URL(caseBookWritingHref("case-1", "book-1", "draft-1", read.searchParams), origin);
assert.equal(write.pathname, "/causas/case-1/escritos");
assert.deepEqual(Object.fromEntries(write.searchParams), { fuentes: "book", libro: "book-1", draft: "draft-1", mesa: "desk-1", volver: returnTo });

const invalid = new URLSearchParams({ mesa: "/otras/mesas", volver: "https://otro.invalid" });
assert.equal(caseLibraryHref("case-1", "../escrito", invalid), "/biblioteca?causa=case-1");
assert.equal(withCaseBookContext("/biblioteca/book-1?mesa=anterior&volver=%2Fpjud&escrito=anterior", "case-1", undefined, invalid), "/biblioteca/book-1?causa=case-1");
assert.equal(withCaseBookContext("/documentos/material", "case-1", "draft-1", active), "/documentos/material");
assert.equal(libraryBookHref("book-1", undefined, undefined, active), "/biblioteca/book-1");
assert.equal(caseBookWritingHref("case-1", "book-1"), "/causas/case-1/escritos?fuentes=book&libro=book-1");
