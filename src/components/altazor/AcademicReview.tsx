import { useId } from "react";
import { ArrowRight, BookOpen, ClipboardCheck, ListChecks, PenLine } from "lucide-react";
import { academicReview } from "./academic-review";
import type { AcademicOverview, AcademicWorkspace } from "./academic-ui";
import styles from "./AltazorAcademic.module.css";

export type ReviewDestination =
  | { kind: "objective" | "sources" | "matrix" | "work" }
  | { kind: "artifact"; id: string };

type ReviewProps = {
  workspaces: AcademicOverview["workspaces"];
  workspace: AcademicWorkspace | null;
  loading: boolean;
  onChoose: (id: string) => void;
  onAction: (destination: ReviewDestination) => void;
  onCreate: () => void;
};

export function AcademicReview({ workspaces, workspace, loading, onChoose, onAction, onCreate }: ReviewProps) {
  const selectId = useId();
  const review = workspace && academicReview(workspace);
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
      <p>Crea un trabajo para llevar el registro de sus lecturas y revisar las citas de su manuscrito.</p>
      <button type="button" className="btn btn-primary" onClick={onCreate}>Crear un trabajo</button>
    </div>}
    {!loading && review && <>
      {!review.objective.defined && <div className={styles.reviewLead}>
        <ListChecks size={20} aria-hidden="true" />
        <div><strong>Falta definir el objetivo</strong><p>Escribe la pregunta que quieres responder o el propósito del texto.</p></div>
        <button type="button" className="btn btn-outline" onClick={() => onAction({ kind: "objective" })}>Definir objetivo</button>
      </div>}
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
          <p className={styles.reviewMethod}>LexOpen comprueba si cada sección enlaza con pasajes conservados. Abre la propuesta para cotejar que el pasaje sostenga el argumento.</p>
          <ul className={styles.reviewManuscripts}>
            {review.artifacts.manuscripts.map(item => <li key={item.artifactId}>
              <div>
                <span className={styles.reviewState}><ClipboardCheck size={15} aria-hidden="true" /> {item.status === "reviewed" ? "Revisado" : "Por revisar"}</span>
                <strong>{item.title}</strong>
                {item.textSections > 0
                  ? <p>{item.sectionsWithReference} de {item.textSections} secciones con pasajes vinculados.</p>
                  : <p>El manuscrito todavía no tiene secciones de texto.</p>}
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
