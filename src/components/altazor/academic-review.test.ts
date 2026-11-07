import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyAcademicBrief } from "@/lib/altazor/academic-schemas";
import { academicReview, nextAcademicReview } from "./academic-review";
import type { AcademicWorkspace } from "./academic-ui";

const emptyWorkspace: AcademicWorkspace = {
  id: "workspace", title: "Trabajo ficticio", kind: "writing", revision: 1,
  brief: emptyAcademicBrief, matrix: { dimensions: [], rows: [] },
  artifacts: [], sources: [], unavailableSources: 0,
};
const sourceInput = { kind: "book" as const, bookId: "book", fragmentId: "fragment", quote: "Pasaje de prueba" };
const source = { title: "Libro de prueba", text: "## Subtítulo en la fuente\nPasaje de prueba", href: "/biblioteca/book", warnings: ["Nota [R9] de la fuente"] };

test("an empty academic workspace has no objective, sources, matrix rows or manuscripts", () => {
  const review = academicReview({ ...emptyWorkspace, brief: { ...emptyAcademicBrief, objective: " \n " } });
  assert.deepEqual(review, {
    objective: { defined: false }, sources: { available: 0, unavailable: 0 },
    matrix: { included: 0, withoutEvidence: [], unavailable: [] },
    artifacts: { awaitingReview: 0, reviewed: 0, unavailable: 0, manuscripts: [] },
  });
});

test("review counts unavailable items without inspecting redacted rows or texts", () => {
  const review = academicReview({
    ...emptyWorkspace,
    brief: { ...emptyAcademicBrief, objective: "Estudiar un problema jurídico" },
    sources: [{ ...source, input: sourceInput, review: "Pasaje disponible" }], unavailableSources: 2,
    matrix: { dimensions: [], rows: [
      { id: "manual", title: "Nota sin pasaje", included: true, cells: { note: { value: "Apunte" } } },
      { id: "backed", title: "Nota con pasaje", included: true, cells: { note: { value: "Apunte", source: sourceInput } } },
      { id: "omitted", title: "Fila excluida", included: false, cells: {} },
      { id: "revoked", title: "Fila cuyo respaldo dejó de estar disponible", included: false, available: false, cells: {} },
    ] },
    artifacts: [
      { id: "unavailable", available: false, status: "reviewed", body: "NO MOSTRAR [R90]" },
      { id: "prepared", available: true, status: "prepared" },
      { id: "failed", available: true, status: "failed" },
      { id: "reviewed", available: true, status: "reviewed", title: "Versión revisada", body: "Resultado [R2]", sources: [source] },
    ],
  });
  assert.deepEqual(review.sources, { available: 1, unavailable: 2 });
  assert.deepEqual(review.matrix, { included: 2, withoutEvidence: ["manual"], unavailable: ["revoked"] });
  assert.deepEqual(review.artifacts, {
    awaitingReview: 0, reviewed: 1, unavailable: 1,
    manuscripts: [{ artifactId: "reviewed", title: "Versión revisada", status: "reviewed", textSections: 1, sectionsWithReference: 0, sectionsWithoutReference: 1, linkedSections: [], unlinkedSectionTitles: ["Texto inicial"], invalidReferenceIds: ["R2"] }],
  });
});

test("only prose sections count towards marker coverage, even with headings in a generated appendix", () => {
  const body = [
    "# Manuscrito", "Propuesta de ALTAZOR para revisión profesional.",
    "## Fundamento", "Primer párrafo [R1].\n\nSegundo párrafo de la misma sección.",
    "## Encabezado sin prosa", "## Límite", "Texto con un marcador ajeno [R3] [^R3].",
    "## Conclusión", "Conclusión [^R1].", "## Otro encabezado",
    "## Fuentes seleccionadas", `[R1] ${source.title}\np. 1\n${source.text}\n${source.href}\n${source.warnings.join("\n")}`,
    "## Adición posterior", "Texto sin marcador.", "## Último encabezado",
  ].join("\r\n\r\n");
  const review = academicReview({
    ...emptyWorkspace, artifacts: [
      { id: "proposal", available: true, status: "proposed", title: "Manuscrito", body, sources: [source] },
      { id: "only-headings", available: true, status: "proposed", body: "# Título\n\nSin fuentes documentales seleccionadas. Este contenido requiere revisión y respaldo independiente.\n\n## Otro título" },
    ],
  });
  const [proposal, empty] = review.artifacts.manuscripts;
  assert.deepEqual(proposal, {
    artifactId: "proposal", title: "Manuscrito", status: "proposed", textSections: 4, sectionsWithReference: 2, sectionsWithoutReference: 2,
    linkedSections: ["Fundamento", "Conclusión"].map(title => ({ title, references: [{ id: "R1", source }] })),
    unlinkedSectionTitles: ["Límite", "Adición posterior"], invalidReferenceIds: ["R3"],
  });
  assert.equal(empty.textSections, 0);
  assert.equal(empty.sectionsWithoutReference, 0);
  assert.equal(review.artifacts.awaitingReview, 2);
});

test("sections use the proposal's passage order and omit duplicate, heading-only and invalid markers", () => {
  const second = { ...source, title: "Segunda fuente", text: "Pasaje distinto", href: "/biblioteca/segundo?fragment=3#fragment-3" };
  const review = academicReview({
    ...emptyWorkspace,
    sources: [{ ...second, input: sourceInput, review: "Fuente del trabajo" }],
    artifacts: [{
      id: "proposal", available: true, status: "proposed", sources: [source, second],
      body: "Texto de apertura [R2] [^R2].\n\n## Fundamento [R2]\n\nArgumento [R1] con marcador inválido [R9].",
    }],
  });
  const [proposal] = review.artifacts.manuscripts;
  assert.deepEqual(proposal.linkedSections, [
    { title: "Texto inicial", references: [{ id: "R2", source: second }] },
    { title: "Fundamento", references: [{ id: "R1", source }] },
  ]);
  assert.deepEqual(proposal.invalidReferenceIds, ["R9"]);
});

test("the next review action follows available evidence and never opens a withheld proposal", () => {
  const active = { ...emptyWorkspace, brief: { ...emptyAcademicBrief, objective: "Contrastar la hipótesis" } };
  const availableSources = [{ ...source, input: sourceInput, review: "Pasaje disponible" }];
  const linked = { id: "linked", available: true, status: "reviewed", body: "Párrafo con cita [R1].", sources: [source] };
  const unlinked = { id: "unlinked", available: true, status: "reviewed", body: "Párrafo sin referencia." };
  const pending = { ...linked, id: "pending", status: "proposed" };
  const next = (change: Partial<AcademicWorkspace> = {}) => nextAcademicReview(academicReview({ ...active, ...change }));

  assert.deepEqual(next({ brief: emptyAcademicBrief }), { reason: "missingObjective", destination: { kind: "objective" } });
  assert.deepEqual(next({ artifacts: [{ ...unlinked, available: false }, pending] }), { reason: "lostAccess", destination: { kind: "sources" } });
  assert.deepEqual(next({ matrix: { dimensions: [], rows: [{ id: "unsupported", title: "Lectura pendiente", included: true, cells: {} }] }, artifacts: [unlinked] }), { reason: "matrixGaps", destination: { kind: "matrix" } });
  assert.deepEqual(next({ artifacts: [pending, unlinked] }), { reason: "citationGaps", destination: { kind: "artifact", id: "unlinked" } });
  assert.deepEqual(next({ artifacts: [pending] }), { reason: "pendingReview", destination: { kind: "artifact", id: "pending" } });
  assert.deepEqual(next(), { reason: "missingSources", destination: { kind: "sources" } });
  assert.deepEqual(next({ sources: availableSources }), { reason: "noProposals", destination: { kind: "work" } });
  assert.equal(next({ artifacts: [linked], sources: availableSources }), null);
});
