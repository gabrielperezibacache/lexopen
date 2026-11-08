"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { BookOpen, ExternalLink, Plus, Trash2 } from "lucide-react";
import { isTeachingLibraryHref, TEACHING_CONTENT_LIMITS, teachingSessionContentSchema, type TeachingSessionContent } from "@/lib/altazor/teaching-session-content";
import styles from "./AcademicSessionContent.module.css";

type Reference = TeachingSessionContent["readings"][number];
type ReferenceKind = "readings" | "materials";
type PeopleKind = "speakers" | "moderators";
type ListKind = ReferenceKind | PeopleKind | "outcomes";
type ReferenceDraft = { key: string; title: string; href: string };
type OutcomeDraft = { key: string; value: string };
type Draft = { readings: ReferenceDraft[]; materials: ReferenceDraft[]; outcomes: OutcomeDraft[]; speakers: OutcomeDraft[]; moderators: OutcomeDraft[]; location: string; activity: string };

const labels = {
  readings: { group: "Lecturas", article: "de la lectura", add: "Añadir lectura", remove: "Quitar lectura" },
  materials: { group: "Materiales", article: "del material", add: "Añadir material", remove: "Quitar material" },
};
const peopleLabels = {
  speakers: { group: "Ponentes", field: "Nombre del ponente", add: "Añadir ponente", remove: "Quitar ponente" },
  moderators: { group: "Moderación", field: "Nombre del moderador", add: "Añadir moderador", remove: "Quitar moderador" },
};

function toDraft(content: TeachingSessionContent): Draft {
  const rows = (items: Reference[]) => items.map(({ title, href }, index) => ({ key: `saved-${index}`, title, href: href ?? "" }));
  return {
    readings: rows(content.readings),
    materials: rows(content.materials),
    outcomes: content.outcomes.map((value, index) => ({ key: `saved-${index}`, value })),
    speakers: (content.speakers ?? []).map((value, index) => ({ key: `saved-${index}`, value })),
    moderators: (content.moderators ?? []).map((value, index) => ({ key: `saved-${index}`, value })),
    location: content.location ?? "",
    activity: content.activity ?? "",
  };
}

function toContent(draft: Draft, origin?: string): TeachingSessionContent {
  function reference({ title, href }: ReferenceDraft): Reference {
    href = href.trim();
    if (origin && /^https?:\/\//i.test(href)) {
      try {
        const url = new URL(href);
        const path = url.pathname + url.search + url.hash;
        if (url.origin === origin && !url.username && !url.password && isTeachingLibraryHref(path)) href = path;
      } catch { /* Keep the entered link for validation. */ }
    }
    return { title: title.trim(), ...(href ? { href } : {}) };
  }
  return {
    readings: draft.readings.map(reference),
    materials: draft.materials.map(reference),
    outcomes: draft.outcomes.map(item => item.value.trim()),
    ...(draft.speakers.length ? { speakers: draft.speakers.map(item => item.value.trim()) } : {}),
    ...(draft.moderators.length ? { moderators: draft.moderators.map(item => item.value.trim()) } : {}),
    ...(draft.location.trim() ? { location: draft.location.trim() } : {}),
    ...(draft.activity.trim() ? { activity: draft.activity.trim() } : {}),
  };
}

function SavedReferences({ items, title }: { items: Reference[]; title: string }) {
  return items.length > 0 && <div>
    <h4>{title}</h4>
    <ul>{items.map((item, index) => <li key={index}>
      {item.href ? <a href={item.href} target="_blank" rel="noopener noreferrer">
        {item.title} <ExternalLink size={14} aria-hidden="true" />
      </a> : item.title}
    </li>)}</ul>
  </div>;
}

export function AcademicSessionContent({ sessionId, title, content, contentRevision, busy, onDirtyChange, onSave }: {
  sessionId: string;
  title: string;
  content: TeachingSessionContent;
  contentRevision: number;
  busy: boolean;
  onDirtyChange: (sessionId: string, dirty: boolean) => void;
  onSave: (expectedRevision: number, content: TeachingSessionContent) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [baseRevision, setBaseRevision] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const rowId = useRef(0);
  const form = useRef<HTMLFormElement>(null);
  const edit = useRef<HTMLButtonElement>(null);
  const count = content.readings.length + content.materials.length + content.outcomes.length
    + (content.speakers?.length ?? 0) + (content.moderators?.length ?? 0) + Number(Boolean(content.location)) + Number(Boolean(content.activity));
  const dirty = Boolean(draft && JSON.stringify(toContent(draft)) !== JSON.stringify(toContent(toDraft(content))));

  useEffect(() => {
    if (!dirty) return;
    onDirtyChange(sessionId, true);
    return () => onDirtyChange(sessionId, false);
  }, [dirty, onDirtyChange, sessionId]);

  function focusInForm(value: string) {
    requestAnimationFrame(() => form.current?.querySelector<HTMLElement>(`[data-session-focus="${value}"]`)?.focus());
  }

  function startEdit() {
    setDraft(toDraft(content));
    setBaseRevision(contentRevision);
    setError(""); setNotice("");
    requestAnimationFrame(() => form.current?.focus({ preventScroll: true }));
  }

  function endEdit() {
    setDraft(null); setError("");
    requestAnimationFrame(() => edit.current?.focus({ preventScroll: true }));
  }

  function add(kind: ListKind) {
    const key = `new-${++rowId.current}`;
    setDraft(current => {
      if (!current || current[kind].length >= TEACHING_CONTENT_LIMITS.itemsPerGroup) return current;
      if (kind === "readings" || kind === "materials") return { ...current, [kind]: [...current[kind], { key, title: "", href: "" }] };
      return { ...current, [kind]: [...current[kind], { key, value: "" }] };
    });
    focusInForm(`${kind}-${key}`);
  }

  function remove(kind: ListKind, key: string) {
    setDraft(current => current ? { ...current, [kind]: current[kind].filter(item => item.key !== key) } : current);
    focusInForm(`add-${kind}`);
  }

  function updateReference(kind: ReferenceKind, key: string, change: Partial<Pick<ReferenceDraft, "title" | "href">>) {
    setDraft(current => current ? { ...current, [kind]: current[kind].map(item => item.key === key ? { ...item, ...change } : item) } : current);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !dirty || busy) return;
    setError(""); setNotice("");
    const result = teachingSessionContentSchema.safeParse(toContent(draft, window.location.origin));
    if (!result.success) {
      const issue = result.error.issues[0];
      setError(issue?.code === "too_small" ? "Completa los elementos que añadiste o quita los que estén vacíos." : issue?.message || "Revisa el contenido antes de guardar.");
      return;
    }
    try {
      await onSave(baseRevision, result.data);
      endEdit();
      setNotice("Contenido guardado.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar el contenido de la sesión.");
    }
  }

  return <details className={styles.root}>
    <summary aria-label={`Contenido de la sesión: ${title}`}>
      <BookOpen size={16} aria-hidden="true" /> Contenido de la sesión
      {count > 0 && <span className={styles.count} aria-label={`${count} ${count === 1 ? "elemento" : "elementos"}`}>{count}</span>}
    </summary>
    <div className={styles.body}>
      {notice && <p role="status" className={styles.notice}>{notice}</p>}
      {draft ? <form aria-label="Contenido de la sesión" tabIndex={-1} ref={form} onSubmit={save} className={styles.editor}
        onInvalidCapture={event => {
          const disclosure = (event.target as HTMLElement).closest("details");
          if (disclosure) disclosure.open = true;
        }}>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <p className={styles.helper}>Puedes pegar un enlace de la <a href="/biblioteca" target="_blank" rel="noopener noreferrer">Biblioteca</a> o de un sitio seguro (https://).</p>
        {(Object.keys(labels) as ReferenceKind[]).map(kind => {
          const text = labels[kind];
          return <fieldset key={kind} disabled={busy} className={styles.group}>
            <legend>{text.group}</legend>
            {draft[kind].map((item, index) => <div className={styles.reference} key={item.key}>
              <label>Título {text.article} {index + 1}
                <input className="input" value={item.title} required maxLength={TEACHING_CONTENT_LIMITS.titleLength}
                  data-session-focus={`${kind}-${item.key}`} onChange={event => updateReference(kind, item.key, { title: event.target.value })} />
              </label>
              <label>Enlace {text.article} {index + 1} (opcional)
                <input className="input" inputMode="url" value={item.href} maxLength={TEACHING_CONTENT_LIMITS.hrefLength}
                  onChange={event => updateReference(kind, item.key, { href: event.target.value })} />
              </label>
              <button type="button" className="btn btn-ghost" aria-label={`${text.remove} ${index + 1}`} onClick={() => remove(kind, item.key)}>
                <Trash2 size={16} aria-hidden="true" /><span>Quitar</span>
              </button>
            </div>)}
            <button type="button" className="btn btn-outline" data-session-focus={`add-${kind}`}
              disabled={draft[kind].length >= TEACHING_CONTENT_LIMITS.itemsPerGroup} onClick={() => add(kind)}>
              <Plus size={16} aria-hidden="true" /> {text.add}
            </button>
            {draft[kind].length === TEACHING_CONTENT_LIMITS.itemsPerGroup && <p className={styles.helper}>Alcanzaste el máximo de {TEACHING_CONTENT_LIMITS.itemsPerGroup} elementos.</p>}
          </fieldset>;
        })}
        <fieldset disabled={busy} className={styles.group}>
          <legend>Resultados de aprendizaje</legend>
          {draft.outcomes.map((item, index) => <div className={styles.outcome} key={item.key}>
            <label>Resultado de aprendizaje {index + 1}
              <input className="input" value={item.value} required maxLength={TEACHING_CONTENT_LIMITS.outcomeLength}
                data-session-focus={`outcomes-${item.key}`} onChange={event => {
                  const value = event.target.value;
                  setDraft(current => current ? { ...current, outcomes: current.outcomes.map(row => row.key === item.key ? { ...row, value } : row) } : current);
                }} />
            </label>
            <button type="button" className="btn btn-ghost" aria-label={`Quitar resultado ${index + 1}`} onClick={() => remove("outcomes", item.key)}>
              <Trash2 size={16} aria-hidden="true" /><span>Quitar</span>
            </button>
          </div>)}
          <button type="button" className="btn btn-outline" data-session-focus="add-outcomes"
            disabled={draft.outcomes.length >= TEACHING_CONTENT_LIMITS.itemsPerGroup} onClick={() => add("outcomes")}>
            <Plus size={16} aria-hidden="true" /> Añadir resultado
          </button>
          {draft.outcomes.length === TEACHING_CONTENT_LIMITS.itemsPerGroup && <p className={styles.helper}>Alcanzaste el máximo de {TEACHING_CONTENT_LIMITS.itemsPerGroup} resultados.</p>}
        </fieldset>
        <details className={styles.people}>
          <summary>Actividad para participantes</summary>
          <div className={styles.peopleFields}>
            <label>Consigna de la actividad
              <textarea className="input" rows={5} value={draft.activity} maxLength={TEACHING_CONTENT_LIMITS.activityLength} disabled={busy}
                onChange={event => { const activity = event.target.value; setDraft(current => current ? { ...current, activity } : current); }} />
            </label>
            <p className={styles.helper}>Se incluirá en el programa y en la hoja para participantes.</p>
          </div>
        </details>
        <details className={styles.people}>
          <summary>Ponentes, moderación y lugar</summary>
          <div className={styles.peopleFields}>
            {(Object.keys(peopleLabels) as PeopleKind[]).map(kind => {
              const text = peopleLabels[kind];
              return <fieldset key={kind} disabled={busy} className={styles.group}>
                <legend>{text.group}</legend>
                {draft[kind].map((item, index) => <div className={styles.outcome} key={item.key}>
                  <label>{text.field} {index + 1}
                    <input className="input" value={item.value} required maxLength={TEACHING_CONTENT_LIMITS.nameLength}
                      data-session-focus={`${kind}-${item.key}`} onChange={event => {
                        const value = event.target.value;
                        setDraft(current => current ? { ...current, [kind]: current[kind].map(row => row.key === item.key ? { ...row, value } : row) } : current);
                      }} />
                  </label>
                  <button type="button" className="btn btn-ghost" aria-label={`${text.remove} ${index + 1}`} onClick={() => remove(kind, item.key)}>
                    <Trash2 size={16} aria-hidden="true" /><span>Quitar</span>
                  </button>
                </div>)}
                <button type="button" className="btn btn-outline" data-session-focus={`add-${kind}`}
                  disabled={draft[kind].length >= TEACHING_CONTENT_LIMITS.itemsPerGroup} onClick={() => add(kind)}>
                  <Plus size={16} aria-hidden="true" /> {text.add}
                </button>
                {draft[kind].length === TEACHING_CONTENT_LIMITS.itemsPerGroup && <p className={styles.helper}>Alcanzaste el máximo de {TEACHING_CONTENT_LIMITS.itemsPerGroup} nombres.</p>}
              </fieldset>;
            })}
            <label>Sala o modalidad de la sesión
              <input className="input" value={draft.location} maxLength={TEACHING_CONTENT_LIMITS.locationLength} disabled={busy} placeholder="Ej. Aula 204 o videoconferencia"
                onChange={event => { const location = event.target.value; setDraft(current => current ? { ...current, location } : current); }} />
            </label>
          </div>
        </details>
        <div className={styles.actions}>
          <button type="submit" className="btn btn-primary" disabled={busy || !dirty}>Guardar contenido</button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={endEdit}>Cancelar</button>
          {dirty && <span className={styles.helper}>Cambios sin guardar</span>}
        </div>
      </form> : <>
        {count === 0 ? <p className={styles.helper}>Vincula las lecturas, los materiales y los resultados de aprendizaje de esta sesión.</p> : <div className={styles.saved}>
          <SavedReferences title="Lecturas" items={content.readings} />
          <SavedReferences title="Materiales" items={content.materials} />
          {content.outcomes.length > 0 && <div>
            <h4>Resultados de aprendizaje</h4>
            <ul>{content.outcomes.map((value, index) => <li key={index}>{value}</li>)}</ul>
          </div>}
          {(Object.keys(peopleLabels) as PeopleKind[]).map(kind => (content[kind]?.length ?? 0) > 0 && <div key={kind}>
            <h4>{peopleLabels[kind].group}</h4>
            <ul>{content[kind]?.map((value, index) => <li key={index}>{value}</li>)}</ul>
          </div>)}
          {content.location && <div><h4>Sala o modalidad</h4><p className={styles.location}>{content.location}</p></div>}
          {content.activity && <div><h4>Actividad</h4><p className={styles.activity}>{content.activity}</p></div>}
        </div>}
        <button ref={edit} type="button" className="btn btn-outline" disabled={busy} onClick={startEdit}>Editar contenido</button>
      </>}
    </div>
  </details>;
}
