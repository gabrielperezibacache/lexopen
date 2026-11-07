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
      speakers: ["Profesora de prueba", "Investigador [invitado]"],
      moderators: ["Moderadora ficticia"],
      location: "Aula 204 · modalidad híbrida",
      activity: "Compara las fuentes.\nAnota una conclusión.",
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
    assert.ok(schedule.includes("**Sala o modalidad**\n\nAula 204 · modalidad híbrida"));
    assert.ok(schedule.includes("**Ponentes**\n\n- Profesora de prueba\n- Investigador \\[invitado\\]"));
    assert.ok(schedule.includes("**Moderación**\n\n- Moderadora ficticia"));
    assert.match(schedule, /\*\*Resultados de aprendizaje\*\*\n\n- Distinguir argumentos/);
    assert.match(schedule, /\*\*Lecturas\*\*\n\n- Lectura base/);
    assert.match(schedule, /\*\*Materiales\*\*\n\n- Guía — https:\/\/example.org\/guia/);
    assert.ok(schedule.includes("**Actividad**\n\nCompara las fuentes.\nAnota una conclusión."));
    assert.ok(academicManuscriptBody(template, "Encuentro", emptyAcademicBrief).includes(`## ${section}\n\n## ${next}`));
  }
  assert.doesNotMatch(academicManuscriptBody("call", "Convocatoria", emptyAcademicBrief, [session]), /Discusión inicial/);
  const handout = academicManuscriptBody("participant_handout", "Encuentro", {
    ...emptyAcademicBrief, objective: "Nota privada del equipo", evaluation: "Pauta de corrección privada",
  }, [session]);
  assert.match(handout, /^# Hoja para participantes\n\n## Encuentro\n\n### Discusión inicial/);
  assert.ok(handout.includes("**Actividad**\n\nCompara las fuentes.\nAnota una conclusión."));
  assert.ok(handout.includes("**Tus notas**\n\n\n\n\n"));
  assert.doesNotMatch(handout, /Nota privada|Pauta de corrección/);
});

test("congress programs group chosen sessions by axis and table while keeping legacy and handout content", () => {
  const sessions = ["primera", "segunda", "libre"].map((id, index) => ({
    id,
    title: `Sesión ${id}`,
    startsAt: new Date(`2030-05-09T${String(16 + index).padStart(2, "0")}:00:00Z`),
    endsAt: null,
    content: { readings: [], materials: [], outcomes: [] },
  }));
  const congress = {
    axes: [{ id: "derecho", title: "Derecho y tecnología" }, { id: "interno", title: "Eje interno" }],
    tables: [
      { id: "debate", axisId: "derecho", title: "Debate jurídico", responsible: "Coordinadora [invitada]", sessionIds: ["segunda", "primera"] },
      { id: "otra", axisId: "interno", title: "Mesa excluida", responsible: "Responsable interno", sessionIds: ["no-elegida"] },
    ],
    actions: [{ id: "encargo", title: "Encargo privado del comité", responsible: "Responsable privada", status: "pending" as const, notes: "Notas internas del encargo", dueAtLocal: "2030-05-09T09:00", tableId: "debate" }],
    meetings: [{ id: "reunion", title: "Reunión interna del comité", date: "2030-05-01", attendees: "Asistentes privados", notes: "Notas reservadas de reunión", agreements: [{ id: "acuerdo", text: "Acuerdo reservado de organización" }] }],
  };
  const brief = { ...emptyAcademicBrief, congress };
  const body = academicManuscriptBody("congress", "Congreso", brief, sessions);
  assert.match(body, /## Programa y mesas\n\n### Eje · Derecho y tecnología\n\n\*\*Mesa · Debate jurídico\*\*/);
  assert.ok(body.includes("**Responsable**\n\nCoordinadora \\[invitada\\]"));
  assert.ok(body.includes("**Sesión primera**"));
  assert.ok(body.indexOf("Sesión primera") < body.indexOf("Sesión segunda"));
  assert.ok(body.includes("### Otras sesiones\n\n**Sesión libre**"));
  assert.doesNotMatch(body, /Eje interno|Mesa excluida|Responsable interno|Encargo privado|Responsable privada|Notas internas|Reunión interna|Asistentes privados|Notas reservadas|Acuerdo reservado/);
  assert.doesNotMatch(body, /^#{4,}/m);
  const legacy = academicManuscriptBody("congress", "Congreso", emptyAcademicBrief, sessions);
  assert.equal(academicManuscriptBody("congress", "Congreso", { ...emptyAcademicBrief, congress: { axes: [], tables: [] } }, sessions), legacy);
  assert.match(legacy, /## Programa y mesas\n\n### Sesión primera/);
  for (const template of ["seminar", "participant_handout"] as const) {
    assert.doesNotMatch(academicManuscriptBody(template, "Congreso", brief, sessions), /Derecho y tecnología|Coordinadora|Debate jurídico|Encargo privado|Responsable privada|Notas internas|Reunión interna|Asistentes privados|Notas reservadas|Acuerdo reservado/);
  }
});
