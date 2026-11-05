import assert from "node:assert/strict";
import { test } from "node:test";
import { ACADEMIC_MODES } from "./academic-schemas";
import { ACADEMIC_JOURNEYS, ACADEMIC_INSTRUCTIONS, academicHref, academicJourney, academicOutline, academicTextStats, tidyAcademicSpacing } from "./academic-templates";

test("the three academic journeys retain every supported task exactly once", () => {
  assert.deepEqual(ACADEMIC_JOURNEYS.flatMap(item => [...item.modes]).sort(), [...ACADEMIC_MODES].sort());
  for (const mode of ACADEMIC_MODES) assert.ok(ACADEMIC_INSTRUCTIONS[mode].length > 40);
  assert.equal(academicJourney("career"), "writing");
  assert.equal(academicHref("a&b", "c=d"), "/academico?trabajo=a%26b&resultado=c%3Dd");
});
test("academic text helpers count Unicode and locate headings without interpreting markup", () => {
  const text = "# Educación\n\nNiño, investigación y fuentes [R1].\n\n## Límites";
  assert.equal(academicTextStats(text).words, 7);
  assert.equal(academicTextStats("").readingMinutes, 0);
  assert.deepEqual(academicOutline(text).map(item => [item.title, text.slice(item.offset, item.offset + 2)]), [["Educación", "# "], ["Límites", "##"]]);
  assert.equal(academicOutline("<script>texto</script>").length, 0);
});
test("spacing cleanup preserves literal quotations, references and Markdown indentation", () => {
  const text = "  “Dos  espacios” [R1].  \r\n\r\n\r\n\r\n    código  ";
  assert.equal(tidyAcademicSpacing(text), "  “Dos  espacios” [R1].\n\n\n    código");
});
