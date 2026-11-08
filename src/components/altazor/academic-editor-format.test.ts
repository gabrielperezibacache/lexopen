import assert from "node:assert/strict";
import { test } from "node:test";
import { formatAcademicSelection, insertAcademicCitation } from "./academic-editor-format";

function apply(value: string, edit: ReturnType<typeof formatAcademicSelection>) {
  return value.slice(0, edit.start) + edit.text + value.slice(edit.end);
}

test("inline formatting keeps spaces and can toggle a selected range", () => {
  const text = "Una hipótesis";
  const bold = formatAcademicSelection(text, 3, text.length, "bold");
  const formatted = apply(text, bold);
  assert.equal(formatted, "Una **hipótesis**");
  assert.equal(apply(formatted, formatAcademicSelection(formatted, bold.selectionStart, bold.selectionEnd, "bold")), text);
  const insideBold = formatAcademicSelection(formatted, 6, 15, "bold");
  assert.equal(apply(formatted, insideBold), text);
});

test("inline formatting sets an insertion point and preserves paragraph breaks", () => {
  assert.deepEqual(formatAcademicSelection("texto", 2, 2, "italic"), { start: 2, end: 2, text: "**", selectionStart: 3, selectionEnd: 3 });
  const text = "Primero\n\nSegundo";
  assert.equal(apply(text, formatAcademicSelection(text, 0, text.length, "bold")), "**Primero**\n\n**Segundo**");
});

test("bold and italic toggle independently when combined", () => {
  const text = "**texto**";
  const italic = formatAcademicSelection(text, 2, 7, "italic");
  const combined = apply(text, italic);
  assert.equal(combined, "***texto***");
  assert.equal(apply(combined, formatAcademicSelection(combined, italic.selectionStart, italic.selectionEnd, "italic")), text);
  assert.equal(apply(combined, formatAcademicSelection(combined, 0, combined.length, "bold")), "*texto*");
});

test("block formatting replaces the current prefix and keeps the caret near the same text", () => {
  const text = "\n## Hallazgo\nConclusión";
  const heading = formatAcademicSelection(text, 8, 8, "title");
  assert.equal(apply(text, heading), "\n# Hallazgo\nConclusión");
  assert.equal(heading.selectionStart, 7);
  const firstBlank = formatAcademicSelection(text, 0, 0, "quote");
  assert.equal(apply(text, firstBlank), "> \n## Hallazgo\nConclusión");
  assert.equal(firstBlank.selectionStart, 2);
});

test("numbering does not include the next unselected line", () => {
  const text = "Primero\nSegundo\nTercero";
  const numbered = formatAcademicSelection(text, 0, text.indexOf("Tercero"), "numbered");
  assert.equal(apply(text, numbered), "1. Primero\n2. Segundo\nTercero");
  const full = apply(text, numbered);
  assert.equal(apply(full, formatAcademicSelection(full, numbered.selectionStart, numbered.selectionEnd, "numbered")), text);
});

test("citation insertion leaves existing words and following punctuation intact", () => {
  const text = "Conclusión, otra idea.";
  const citation = insertAcademicCitation(text, text.indexOf(","), 2);
  assert.equal(apply(text, citation), "Conclusión [R2], otra idea.");
  assert.equal(citation.selectionStart, "Conclusión [R2]".length);
});
