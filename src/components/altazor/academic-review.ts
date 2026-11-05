import { academicOutline } from "@/lib/altazor/academic-templates";
import type { AcademicArtifact, AcademicWorkspace } from "./academic-ui";

export type AcademicManuscriptReview = {
  artifactId: string;
  title: string;
  status: "proposed" | "reviewed";
  textSections: number;
  sectionsWithReference: number;
  sectionsWithoutReference: number;
  unlinkedSectionTitles: string[];
  invalidReferenceIds: string[];
};

// Match the native marker grammar in academicWritingBody. The coverage count
// measures links to saved passages only.
const referenceMarker = /\[\^?(R[1-9][0-9]*)\]/g;
const generatedNotes = new Set([
  "Propuesta de ALTAZOR para revisión profesional.",
  "Sin fuentes documentales seleccionadas. Este contenido requiere revisión y respaldo independiente.",
]);
const normalizedLines = (text: string) => text.replace(/\r\n?/g, "\n");

function withoutGeneratedAppendix(body: string, sources: NonNullable<AcademicArtifact["sources"]>) {
  const first = sources[0], last = sources.at(-1);
  if (!first || !last) return body;
  const heading = "\n\n## Fuentes seleccionadas\n\n";
  const start = body.lastIndexOf(heading), firstReferenceStart = start + heading.length;
  if (start === -1 || !body.startsWith(normalizedLines(`[R1] ${first.title}\n`), firstReferenceStart)) return body;
  const lastReference = normalizedLines(`[R${sources.length}] ${last.title}\n`);
  const lastReferenceStart = body.indexOf(lastReference, firstReferenceStart);
  if (lastReferenceStart === -1) return body;
  const footer = normalizedLines(`\n${last.text}\n${last.href}\n${last.warnings.join("\n")}`).trimEnd();
  const footerStart = body.indexOf(footer, lastReferenceStart + lastReference.length);
  return footerStart === -1 ? body : body.slice(0, start) + body.slice(footerStart + footer.length);
}

function inspectManuscript(artifact: AcademicArtifact, status: AcademicManuscriptReview["status"]): AcademicManuscriptReview {
  const sources = artifact.sources || [], invalidReferenceIds = new Set<string>();
  const body = withoutGeneratedAppendix(normalizedLines(artifact.body || ""), sources), headings = academicOutline(body);
  const unlinkedSectionTitles: string[] = [];
  let textSections = 0;
  const sections = [
    { title: "", text: body.slice(0, headings[0]?.offset ?? body.length) },
    ...headings.map((heading, index) => {
      const endOfHeading = body.indexOf("\n", heading.offset);
      return { title: heading.title, text: endOfHeading === -1 ? "" : body.slice(endOfHeading + 1, headings[index + 1]?.offset ?? body.length) };
    }),
  ];
  for (const section of sections) {
    const text = section.text.split("\n").filter(line => !generatedNotes.has(line.trim())).join("\n").trim();
    const textReferenceIds = Array.from(text.matchAll(referenceMarker), match => match[1]);
    const headingReferenceIds = Array.from(section.title.matchAll(referenceMarker), match => match[1]);
    for (const id of [...headingReferenceIds, ...textReferenceIds]) {
      if (Number(id.slice(1)) > sources.length) invalidReferenceIds.add(id);
    }
    if (!/[\p{L}\p{N}]/u.test(text.replace(referenceMarker, ""))) continue;
    textSections++;
    if (!textReferenceIds.some(id => Number(id.slice(1)) <= sources.length)) {
      unlinkedSectionTitles.push(section.title.replace(referenceMarker, "").trim().slice(0, 140) || "Texto inicial");
    }
  }
  return { artifactId: artifact.id, title: artifact.title || "Propuesta sin título", status, textSections, sectionsWithReference: textSections - unlinkedSectionTitles.length, sectionsWithoutReference: unlinkedSectionTitles.length, unlinkedSectionTitles, invalidReferenceIds: [...invalidReferenceIds] };
}

/** Review the workspace and source snapshots already revalidated by the server. */
export function academicReview(workspace: AcademicWorkspace) {
  const objective = { defined: Boolean(workspace.brief.objective.trim()) };
  const sources = { available: workspace.sources.length, unavailable: workspace.unavailableSources };

  const matrix = { included: 0, withoutEvidence: [] as string[], unavailable: [] as string[] };
  for (const row of workspace.matrix.rows) {
    if (row.available === false) matrix.unavailable.push(row.id);
    else if (row.included) {
      matrix.included++;
      if (!Object.values(row.cells).some(cell => cell.source)) matrix.withoutEvidence.push(row.id);
    }
  }
  const artifacts = { awaitingReview: 0, reviewed: 0, unavailable: 0, manuscripts: [] as AcademicManuscriptReview[] };
  for (const artifact of workspace.artifacts) {
    if (!artifact.available) artifacts.unavailable++;
    else if (artifact.status === "proposed" || artifact.status === "reviewed") {
      if (artifact.status === "proposed") artifacts.awaitingReview++;
      else artifacts.reviewed++;
      artifacts.manuscripts.push(inspectManuscript(artifact, artifact.status));
    }
  }
  return { objective, sources, matrix, artifacts };
}
