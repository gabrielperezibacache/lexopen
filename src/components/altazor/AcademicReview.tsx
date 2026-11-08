import { useId, useState } from "react";
import { ArrowRight, BookOpen, ClipboardCheck, PenLine } from "lucide-react";
import { FolioSymbol } from "@/components/ui/FolioSymbol";
import { academicReview, nextAcademicReview, type AcademicManuscriptReview, type AcademicPassageReference, type ReviewDestination } from "./academic-review";
import type { AcademicOverview, AcademicWorkspace } from "./academic-ui";
import styles from "./AltazorAcademic.module.css";

export type { ReviewDestination } from "./academic-review";

const nextReviewCopy = {
  missingObjective: { title: "Falta definir el objetivo", detail: "Escribe la pregunta que quieres responder o el propósito del texto.", action: "Definir objetivo" },
  lostAccess: { title: "Hay respaldos sin acceso", detail: "Comprueba cuáles puedes recuperar o elige otros pasajes para tu trabajo.", action: "Revisar acceso a pasajes" },
  matrixGaps: { title: "Revisa el respaldo de la matriz", detail: "Hay lecturas incluidas sin un pasaje vinculado o respaldos que ya no están disponibles.", action: "Revisar la matriz" },
  citationGaps: { title: "Una propuesta tiene citas pendientes de cotejo", detail: "Abre el texto para revisar las secciones sin respaldo vinculado y los marcadores sin pasaje asociado.", action: "Cotejar citas" },
  pendingReview: { title: "Hay una propuesta por revisar", detail: "Abre el texto y coteja sus argumentos con los pasajes que cita.", action: "Revisar la propuesta" },
  missingSources: { title: "Elige los pasajes que sostienen el trabajo", detail: "Busca en tu biblioteca o en los documentos a los que tienes acceso.", action: "Elegir pasajes para el trabajo" },
  noProposals: { title: "Los pasajes están disponibles", detail: "Cuando tengas una propuesta, aquí podrás consultar las secciones con citas vinculadas.", action: "Ir a la preparación" },
} as const;

type ReviewProps = {
  workspaces: AcademicOverview["workspaces"];
  workspace: AcademicWorkspace | null;
  loading: boolean;
  onChoose: (id: string) => void;
  onAction: (destination: ReviewDestination) => void;
  onCreate: () => void;
};

function PassageDisclosure({ id, source }: AcademicPassageReference) {
  const [open, setOpen] = useState(false);
  return <details onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{id} · {source.title}</summary>
    {open && <>
      <blockquote>{source.text}</blockquote>
      {source.warnings.map(warning => <p key={warning}>{warning}</p>)}
      <a href={source.href}>Abrir pasaje en la fuente</a>
    </>}
  </details>;
}

function ManuscriptPassages({ sections }: { sections: AcademicManuscriptReview["linkedSections"] }) {
  const [open, setOpen] = useState(false);
  return <details className={styles.reviewPassages} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Pasajes citados por sección</summary>
    {open && <ol>
      {sections.map((section, index) => <li key={index}>
        <h4>{section.title}</h4>
        {section.references.map(reference => <PassageDisclosure key={reference.id} {...reference} />)}
      </li>)}
    </ol>}
  </details>;
}

export function AcademicReview({ workspaces, workspace, loading, onChoose, onAction, onCreate }: ReviewProps) {
  const selectId = useId();
  const review = workspace && academicReview(workspace);
  const next = review && nextAcademicReview(review);
  const lead = next ? nextReviewCopy[next.reason] : null;
  const missingRows = review && workspace?.matrix.rows.filter(row => review.matrix.withoutEvidence.includes(row.id));

  return <section className={styles.review} aria-label="Mesa de revisión académica">
    <header className={styles.reviewHeader}>
      <div>
        <h2>Mesa de revisión</h2>
        <p>Coteja las citas de cada propuesta, detecta lecturas sin respaldo y abre el punto que necesita tu revisión.</p>
      </div>
      {workspaces.length > 0 && <div className={styles.reviewSelect}>
        <label htmlFor={selectId}>Trabajo que quieres revisar</label>
        <select id={selectId} value={workspace?.id || ""} disabled={loading} onChange={event => { if (event.target.value) onChoose(event.target.value); }}>
          <option value="" disabled>Elige un trabajo</option>
          {workspaces.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
      </div>}
    </header>
    {loading && <p role="status">Comprobando el acceso a las fuentes y propuestas…</p>}
    {!loading && !workspaces.length && <div className={styles.reviewEmpty}>
      <FolioSymbol variant="evidence" className={styles.reviewSymbol} />
      <div><h3>Aún no tienes trabajos</h3><p>Crea uno para reunir sus lecturas y revisar las citas del manuscrito.</p>
        <button type="button" className="btn btn-primary" onClick={onCreate}>Crear un trabajo</button>
      </div>
    </div>}
    {!loading && workspaces.length > 0 && !review && <div className={styles.reviewEmpty}>
      <FolioSymbol variant="evidence" className={styles.reviewSymbol} />
      <div><h3>Elige un trabajo</h3><p>Verás sus pasajes disponibles, sus lecturas y las propuestas que puedes revisar.</p></div>
    </div>}
    {!loading && review && <>
      <div className={styles.reviewLead}>
        <FolioSymbol variant="evidence" className={styles.reviewSymbol} />
        <div>
          <h3>{lead?.title || "Los manuscritos disponibles figuran como revisados"}</h3>
          <p>{lead?.detail || "Puedes abrir cualquier propuesta y volver a cotejar el argumento con sus citas."}</p>
        </div>
        {next && lead && <button type="button" className="btn btn-primary" onClick={() => onAction(next.destination)}>{lead.action} <ArrowRight size={16} aria-hidden="true" /></button>}
      </div>
      <section className={styles.reviewGroup} aria-labelledby="academic-review-sources">
        <h3 id="academic-review-sources"><BookOpen size={19} aria-hidden="true" /> Fuentes y matriz</h3>
        <dl className={styles.reviewCounts}>
          <div><dt>Pasajes disponibles</dt><dd>{review.sources.available}</dd></div>
          <div><dt>Pasajes sin acceso</dt><dd>{review.sources.unavailable}</dd></div>
          <div><dt>Lecturas incluidas</dt><dd>{review.matrix.included}</dd></div>
        </dl>
        {review.sources.unavailable > 0 && <p>Recupera el acceso a los pasajes retirados o elige otros que respalden tu trabajo.</p>}
        {missingRows?.length ? <div className={styles.reviewGap}>
          <strong>Lecturas incluidas sin un pasaje vinculado</strong>
          <ul>{missingRows.map(row => <li key={row.id}>{row.title || "Lectura sin título"}</li>)}</ul>
        </div> : null}
        {review.matrix.unavailable.length > 0 && <p>{review.matrix.unavailable.length} lecturas tienen respaldo sin acceso.</p>}
        <div className={styles.reviewActions}>
          <button type="button" className="btn btn-outline" onClick={() => onAction({ kind: "sources" })}>{review.sources.available ? "Revisar pasajes" : "Elegir pasajes"} <ArrowRight size={16} aria-hidden="true" /></button>
          <button type="button" className="btn btn-ghost" onClick={() => onAction({ kind: "matrix" })}>Abrir matriz de lecturas <ArrowRight size={16} aria-hidden="true" /></button>
        </div>
      </section>
      <section className={styles.reviewGroup} aria-labelledby="academic-review-manuscripts">
        <h3 id="academic-review-manuscripts"><PenLine size={19} aria-hidden="true" /> Propuestas y manuscritos</h3>
        <dl className={styles.reviewCounts}>
          <div><dt>Por revisar</dt><dd>{review.artifacts.awaitingReview}</dd></div>
          <div><dt>Revisados</dt><dd>{review.artifacts.reviewed}</dd></div>
          <div><dt>Sin acceso al respaldo</dt><dd>{review.artifacts.unavailable}</dd></div>
        </dl>
        {review.artifacts.manuscripts.length > 0 ? <>
          <p className={styles.reviewMethod}>Comprueba qué pasajes enlaza cada sección y coteja su relación con el argumento. Puedes abrir la propuesta para corregir el texto.</p>
          <ul className={styles.reviewManuscripts}>
            {review.artifacts.manuscripts.map(item => <li key={item.artifactId}>
              <div>
                <span className={styles.reviewState}><ClipboardCheck size={15} aria-hidden="true" /> {item.status === "reviewed" ? "Revisado" : "Por revisar"}</span>
                <strong>{item.title}</strong>
                {item.textSections > 0
                  ? <div className={styles.reviewCoverage}>
                    <p>{item.sectionsWithReference} de {item.textSections} secciones con pasajes vinculados.</p>
                    <div className={styles.reviewCoverageTrack} aria-hidden="true">
                      <span style={{ width: `${item.sectionsWithReference / item.textSections * 100}%` }} />
                    </div>
                  </div>
                  : <p>El manuscrito todavía no tiene secciones de texto.</p>}
                {item.linkedSections.length > 0 && <ManuscriptPassages sections={item.linkedSections} />}
                {item.sectionsWithoutReference > 0 && <details className={styles.reviewGap}>
                  <summary>{item.sectionsWithoutReference === 1 ? "Una sección sin pasajes vinculados" : `${item.sectionsWithoutReference} secciones sin pasajes vinculados`}</summary>
                  <ul>{item.unlinkedSectionTitles.map((title, index) => <li key={index}>{title}</li>)}</ul>
                </details>}
                {item.invalidReferenceIds.length > 0 && <p>Marcadores sin pasaje asociado <strong>{item.invalidReferenceIds.join(", ")}</strong></p>}
              </div>
              <button type="button" className="btn btn-outline" onClick={() => onAction({ kind: "artifact", id: item.artifactId })}>Abrir propuesta <ArrowRight size={16} aria-hidden="true" /></button>
            </li>)}
          </ul>
        </> : <div className={styles.reviewActions}>
          <p>Cuando tengas una propuesta, podrás comprobar aquí sus secciones y sus citas.</p>
          <button type="button" className="btn btn-outline" onClick={() => onAction({ kind: "work" })}>Ir a las propuestas <ArrowRight size={16} aria-hidden="true" /></button>
        </div>}
      </section>
    </>}
  </section>;
}
