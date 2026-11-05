import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyAcademicBrief } from "@/lib/altazor/academic-schemas";
import { academicReview } from "./academic-review";
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
    manuscripts: [{ artifactId: "reviewed", title: "Versión revisada", status: "reviewed", textSections: 1, sectionsWithReference: 0, sectionsWithoutReference: 1, unlinkedSectionTitles: ["Texto inicial"], invalidReferenceIds: ["R2"] }],
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
  assert.deepEqual(proposal, { artifactId: "proposal", title: "Manuscrito", status: "proposed", textSections: 4, sectionsWithReference: 2, sectionsWithoutReference: 2, unlinkedSectionTitles: ["Límite", "Adición posterior"], invalidReferenceIds: ["R3"] });
  assert.equal(empty.textSections, 0);
  assert.equal(empty.sectionsWithoutReference, 0);
  assert.equal(review.artifacts.awaitingReview, 2);
});
