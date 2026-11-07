import assert from "node:assert/strict";
import { test } from "node:test";
import { ACADEMIC_MODES, emptyAcademicBrief } from "./academic-schemas";
import { ACADEMIC_JOURNEYS, ACADEMIC_INSTRUCTIONS, academicHref, academicJourney, academicManuscriptBody, academicOutline, academicTextStats, tidyAcademicSpacing } from "./academic-templates";

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

test("course drafts preserve selected resource destinations and date changes at midnight in Santiago", () => {
  const session = {
    title: "Taller\n## Ejercicios",
    startsAt: new Date("2026-11-10T02:30:00Z"),
    endsAt: new Date("2026-11-10T03:30:00Z"),
    content: {
      readings: [{ title: "Extracto [R1]", href: "/biblioteca/libro?fragment=2#fragment-2" }],
      materials: [],
      outcomes: ["Contrastar hipótesis"],
    },
  };
  const syllabus = academicManuscriptBody("course", "Curso", emptyAcademicBrief, [session]);
  assert.match(syllabus, /## Unidades y sesiones\n\n### Taller ## Ejercicios\n\n09-11-2026, 23:30 – 10-11-2026, 00:30 \(Santiago\)/);
  assert.ok(syllabus.includes("- Extracto \\[R1\\] — /biblioteca/libro?fragment=2#fragment-2"));
  assert.ok(syllabus.includes("- Contrastar hipótesis"));
  assert.doesNotMatch(syllabus, /\*\*Materiales\*\*/);
  assert.doesNotMatch(academicManuscriptBody("article", "Curso", emptyAcademicBrief, [session]), /Taller/);
});

test("teaching programs place Agenda sessions under the existing program heading", () => {
  const session = {
    title: "Discusión inicial",
    startsAt: new Date("2026-11-15T16:00:00Z"),
    endsAt: null,
    content: {
      readings: [{ title: "Lectura base" }],
      materials: [{ title: "Guía", href: "https://example.org/guia" }],
      outcomes: ["Distinguir argumentos"],
    },
  };
  for (const [template, section, next] of [
    ["seminar", "Programa y ponentes", "Lecturas previas"],
    ["congress", "Programa y mesas", "Convocatoria y evaluación"],
    ["workshop", "Actividades y tiempos", "Materiales"],
  ] as const) {
    const program = academicManuscriptBody(template, "Encuentro", emptyAcademicBrief, [session]);
    const schedule = program.split(`## ${section}\n\n`)[1]?.split(`\n\n## ${next}`)[0];
    assert.ok(schedule);
    assert.match(schedule, /^### Discusión inicial\n\n15-11-2026, 13:00 \(Santiago\)/);
    assert.match(schedule, /\*\*Resultados de aprendizaje\*\*\n\n- Distinguir argumentos/);
    assert.match(schedule, /\*\*Lecturas\*\*\n\n- Lectura base/);
    assert.match(schedule, /\*\*Materiales\*\*\n\n- Guía — https:\/\/example.org\/guia/);
    assert.ok(academicManuscriptBody(template, "Encuentro", emptyAcademicBrief).includes(`## ${section}\n\n## ${next}`));
  }
  assert.doesNotMatch(academicManuscriptBody("call", "Convocatoria", emptyAcademicBrief, [session]), /Discusión inicial/);
});
