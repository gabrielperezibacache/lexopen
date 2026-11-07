"use client";

import { useState } from "react";
import { ArrowDown, ArrowRight, BookOpen, CalendarDays, ExternalLink, GraduationCap, LibraryBig, Megaphone, PenTool, UsersRound } from "lucide-react";
import type { AcademicCallOrigin } from "@/lib/altazor/academic-calls";
import { ACADEMIC_CALL_STATUS, emptyAcademicCall, emptyAcademicSyllabus, type AcademicCall, type AcademicSyllabus, type emptyAcademicBrief } from "@/lib/altazor/academic-schemas";
import { ACADEMIC_MANUSCRIPT_TEMPLATES, ACADEMIC_TEACHING_TEMPLATES } from "@/lib/altazor/academic-templates";
import { formatCivilDate, SANTIAGO_TZ } from "@/lib/chile-time";
import { isWorkCountry, workCountryOptions } from "@/lib/config/countries";
import { AcademicCallSources } from "./AcademicCallSources";
import { AcademicAgendaSessionPicker } from "./AcademicAgendaSessionPicker";
import { AltazorMark } from "./AltazorMark";
import { useOptionalAltazorCompanion } from "./AltazorCompanionProvider";
import type { AcademicProject } from "./academic-ui";
import styles from "./AcademicTeaching.module.css";

export type TeachingTemplate = (typeof ACADEMIC_TEACHING_TEMPLATES)[number];
const icons = { course: GraduationCap, seminar: BookOpen, congress: UsersRound, workshop: PenTool, call: Megaphone };
const fields = [
  { id: "summary", label: "Resumen del curso", rows: 3, max: 4000 },
  { id: "approach", label: "Enfoque y metodología", rows: 3, max: 3000 },
  { id: "schedule", label: "Horario", rows: 2, max: 1500, placeholder: "Ej. Lunes, 16:00–17:30 · hora local" },
  { id: "room", label: "Sala o modalidad", rows: 2, max: 600, placeholder: "Ej. Sala 204, Campus Centro" },
  { id: "requirements", label: "Exigencias y requisitos", rows: 3, max: 3000 },
  { id: "bibliography", label: "Bibliografía base", rows: 4, max: 5000, placeholder: "Una referencia por párrafo." },
] as const;
const courseBriefFields = [
  { id: "audience", label: "Destinatarios", max: 1000 },
  { id: "duration", label: "Duración", max: 100 },
  { id: "learningOutcomes", label: "Resultados de aprendizaje", max: 6000 },
  { id: "evaluation", label: "Evaluación", max: 6000 },
] as const;
type CourseBriefKey = (typeof courseBriefFields)[number]["id"];
const countries = workCountryOptions("es");
const countryNames = new Map<string, string>(countries.map(({ code, label }) => [code, label]));
const consultationDate = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeZone: SANTIAGO_TZ });

export function AcademicTeaching({ projects, blocked, onStart, onOpen, onSaved }: {
  projects: AcademicProject[];
  blocked: boolean;
  onStart: (template: TeachingTemplate) => void;
  onOpen: (id: string) => void;
  onSaved: (project: AcademicProject) => void;
}) {
  const [country, setCountry] = useState("");
  const calls = projects.filter(project => project.kind === "call");
  const otherProjects = projects.filter(project => project.kind !== "call");
  const visibleCalls = country ? calls.filter(project => project.call?.country === country) : calls;
  const activeCountries = [...new Set(calls.flatMap(project => project.call?.country ? [project.call.country] : []))].sort((a, b) =>
    (countryNames.get(a) || a).localeCompare(countryNames.get(b) || b, "es")
  );
  return <section className={styles.studio} aria-labelledby="teaching-title">
    <header className={styles.heading}>
      <GraduationCap size={32} strokeWidth={1.4} aria-hidden="true" />
      <div><h2 id="teaching-title">Docencia y encuentros</h2><p>Organiza un curso, una actividad o una convocatoria. Cada trabajo reúne su ficha, sus fuentes y sus documentos.</p>
        <a className={styles.callJump} href="#convocatorias-oficiales">Buscar convocatorias oficiales <ArrowDown size={15} aria-hidden="true" /></a>
      </div>
    </header>
    <ul className={styles.catalog}>
      {ACADEMIC_TEACHING_TEMPLATES.map((id, index) => {
        const Icon = icons[id], template = ACADEMIC_MANUSCRIPT_TEMPLATES[id];
        return <li key={id}><button type="button" disabled={blocked} onClick={() => onStart(id)}>
          <span className={styles.index} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
          <Icon size={23} strokeWidth={1.5} aria-hidden="true" />
          <span><strong>{id === "course" ? "Curso" : template.label}</strong><small>{template.description}</small></span>
          <ArrowRight size={17} aria-hidden="true" />
        </button></li>;
      })}
    </ul>
    {calls.length > 0 && <section aria-labelledby="teaching-calls-title" className={styles.syllabus}>
      <h3 id="teaching-calls-title">Mis convocatorias</h3>
      <label>Filtrar por país<select aria-label="Filtrar por país" value={country} onChange={event => setCountry(event.target.value)}>
        <option value="">Todos los países</option>
        {activeCountries.map(code => <option key={code} value={code}>{countryNames.get(code) || code}</option>)}
      </select></label>
      {visibleCalls.length ? <ul className={styles.projects}>{visibleCalls.map(project => <li key={project.id}>
        <button type="button" disabled={blocked} onClick={() => onOpen(project.id)}><span><strong>{project.title}</strong>
          <small className={styles.meta}>{[project.call?.country ? countryNames.get(project.call.country) : "", project.call ? ACADEMIC_CALL_STATUS[project.call.status] : "Ficha por completar", project.call?.deadline ? `Cierre ${project.call.deadline}` : ""].filter(Boolean).join(" · ")}</small>
        </span><ArrowRight size={16} aria-hidden="true" /></button>
      </li>)}</ul> : <p role="status">Aún no tienes convocatorias en este país.</p>}
    </section>}
    {otherProjects.length > 0 && <section aria-labelledby="teaching-projects-title">
      <h3 id="teaching-projects-title">Mis trabajos docentes</h3>
      <ul className={styles.projects}>{otherProjects.map(project => <li key={project.id}><button type="button" disabled={blocked} onClick={() => onOpen(project.id)}>{project.title}<ArrowRight size={16} aria-hidden="true" /></button></li>)}</ul>
    </section>}
    <AcademicCallSources blocked={blocked} onOpen={onOpen} onSaved={onSaved} />
  </section>;
}

export function AcademicCallForm({ value = emptyAcademicCall, origin, busy, onChange }: {
  value?: AcademicCall;
  origin?: AcademicCallOrigin | null;
  busy: boolean;
  onChange: (call: AcademicCall) => void;
}) {
  return <section className={styles.syllabus} aria-labelledby="call-details-title">
    <header className={styles.heading}><Megaphone size={27} strokeWidth={1.4} aria-hidden="true" />
      <div><h3 id="call-details-title">Ficha de la convocatoria</h3><p>Conserva los datos de las bases para seguir la postulación y consultar su origen.</p></div>
    </header>
    {origin && <details className={styles.origin}>
      <summary>Origen de la convocatoria · {origin.sourceLabel}</summary>
      <p className={styles.meta}>Consulta guardada el <time dateTime={origin.checkedAt}>{consultationDate.format(new Date(origin.checkedAt))}</time>.</p>
      <p><strong>{origin.title}</strong></p>
      {origin.summary && <p className={styles.originSummary}>{origin.summary}</p>}
      {origin.deadline && <p className={styles.meta}>Cierre informado en esa consulta <time dateTime={origin.deadline}>{formatCivilDate(origin.deadline)}</time></p>}
      <a className={styles.callJump} href={origin.url} target="_blank" rel="noopener noreferrer">Abrir aviso oficial <ExternalLink size={15} aria-hidden="true" /></a>
    </details>}
    <fieldset disabled={busy} className={styles.fields}>
      <legend className="sr-only">Datos de la convocatoria</legend>
      <label>País<select aria-label="País" value={value.country} onChange={event => {
        const country = event.target.value;
        onChange({ ...value, country: isWorkCountry(country) ? country : "" });
      }}>
        <option value="">Sin país asignado</option>{countries.map(({ code, label }) => <option key={code} value={code}>{label}</option>)}
      </select></label>
      <label>Organismo convocante<input value={value.organization} maxLength={200} onChange={event => onChange({ ...value, organization: event.target.value })} /></label>
      <label>Fecha de cierre<input type="date" value={value.deadline} onChange={event => onChange({ ...value, deadline: event.target.value })} /></label>
      <label>Estado<select aria-label="Estado" value={value.status} onChange={event => onChange({ ...value, status: event.target.value as AcademicCall["status"] })}>
        {Object.entries(ACADEMIC_CALL_STATUS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <label data-wide="">Enlace a las bases<input type="url" value={value.url} placeholder="https://" maxLength={1000} onChange={event => onChange({ ...value, url: event.target.value })} /></label>
    </fieldset>
  </section>;
}

export function AcademicSyllabusForm({ workspaceId, sessionsVersion, title, brief, busy, sessionContentDirty, onChange, onBriefChange, onCreate, onHandout, onSearch }: {
  workspaceId: string;
  sessionsVersion: number;
  title: string;
  brief: typeof emptyAcademicBrief;
  busy: boolean;
  sessionContentDirty: boolean;
  onChange: (syllabus: AcademicSyllabus) => void;
  onBriefChange: (key: CourseBriefKey, value: string) => void;
  onCreate: () => void;
  onHandout: () => void;
  onSearch: () => void;
}) {
  const companion = useOptionalAltazorCompanion();
  const [notice, setNotice] = useState("");
  const values = brief.syllabus || emptyAcademicSyllabus;
  function recommend() {
    const topic = title.replace(/\s+/g, " ").trim();
    if (!topic || !companion) return;
    const prepared = companion.preparePersonalMessage(`Sugiere bibliografía para el curso «${topic}». Separa lecturas introductorias y avanzadas. Incluye autor, título y un DOI o enlace editorial que pueda comprobar cuando esté disponible. Si no puedes corroborar una referencia, señala la duda. Entrega las sugerencias en esta conversación para que yo las revise y elija.`);
    setNotice(prepared ? "Mensaje preparado en Altazor. Revísalo y envíalo cuando quieras." : "Tu conversación actual se conserva. Abre el contexto personal y deja libre el cuadro de mensaje para preparar la consulta.");
  }
  return <section className={styles.syllabus} aria-labelledby="syllabus-title">
    <header className={styles.heading}>
      <LibraryBig size={29} strokeWidth={1.4} aria-hidden="true" />
      <div><h3 id="syllabus-title">Ficha para el syllabus</h3><p>Completa lo que ya sabes del curso. LexOpen lo convierte en un documento editable con secciones para lo que falte.</p></div>
    </header>
    <fieldset disabled={busy} className={styles.fields}>
      <legend className="sr-only">Datos del curso</legend>
      {fields.filter(field => field.id !== "bibliography").map(field => <label key={field.id}>
        <span>{field.label}</span>
        <textarea rows={field.rows} maxLength={field.max} placeholder={"placeholder" in field ? field.placeholder : undefined}
          value={values[field.id]} onChange={event => onChange({ ...values, [field.id]: event.target.value })} />
      </label>)}
      {courseBriefFields.map(field => <label key={field.id}>
        <span>{field.label}</span>
        <textarea rows={field.id === "duration" ? 1 : 3} maxLength={field.max} value={brief[field.id]}
          onChange={event => onBriefChange(field.id, event.target.value)} />
      </label>)}
      <label data-wide=""><span>Bibliografía base</span><textarea rows={4} maxLength={5000} placeholder="Una referencia por párrafo."
        value={values.bibliography} onChange={event => onChange({ ...values, bibliography: event.target.value })} /></label>
    </fieldset>
    <AcademicAgendaSessionPicker documentKind="syllabus" workspaceId={workspaceId} version={sessionsVersion} selection={values.sessionIds || []}
      onChange={sessionIds => onChange({ ...values, sessionIds })} disabled={busy} />
    {sessionContentDirty && <p className={styles.meta} role="status">Guarda o descarta el contenido de la sesión antes de crear el syllabus.</p>}
    <div className={styles.actions}>
      <button type="button" className="btn btn-primary" disabled={busy || sessionContentDirty || !title.trim()} onClick={onCreate}>Crear syllabus <ArrowRight size={16} aria-hidden="true" /></button>
      {companion && <button type="button" className="btn btn-outline" disabled={busy || !title.trim() || companion.loading} onClick={recommend}>
        <AltazorMark size={21} state="ready" /> Pedir bibliografía a Altazor
      </button>}
      <button type="button" className="btn btn-ghost" disabled={busy || sessionContentDirty} onClick={onSearch}><BookOpen size={16} aria-hidden="true" /> Buscar obras</button>
    </div>
    <ParticipantHandoutAction disabled={busy || sessionContentDirty || !title.trim()} hasSelection={Boolean(values.sessionIds?.length)} onCreate={onHandout} />
    <p className={styles.meta}><CalendarDays size={16} aria-hidden="true" /> La ficha conserva el horario y la sala para el documento.</p>
    {notice && <p role="status" className={styles.meta}>{notice}</p>}
  </section>;
}

const programTitles = { seminar: "Programa del seminario", congress: "Programa del congreso", workshop: "Programa del taller" } as const;

export function AcademicTeachingProgram({ kind, workspaceId, sessionsVersion, selection, title, busy, sessionContentDirty, onChange, onCreate, onHandout }: {
  kind: keyof typeof programTitles;
  workspaceId: string;
  sessionsVersion: number;
  selection: string[];
  title: string;
  busy: boolean;
  sessionContentDirty: boolean;
  onChange: (sessionIds: string[]) => void;
  onCreate: () => void;
  onHandout: () => void;
}) {
  const Icon = icons[kind];
  return <section className={styles.syllabus} aria-labelledby="teaching-program-title">
    <header className={styles.heading}>
      <Icon size={27} strokeWidth={1.4} aria-hidden="true" />
      <div><h3 id="teaching-program-title">{programTitles[kind]}</h3>
        <p>Crea un documento editable con la plantilla y las sesiones que elijas. Puedes <a className={styles.inlineLink} href="#agenda-docencia">añadir o editar sesiones en tu Agenda</a>.</p>
      </div>
    </header>
    <AcademicAgendaSessionPicker documentKind="programa" workspaceId={workspaceId} version={sessionsVersion}
      selection={selection} onChange={onChange} disabled={busy} />
    {sessionContentDirty && <p className={styles.meta} role="status">Guarda o descarta el contenido de la sesión antes de crear el programa.</p>}
    <div className={styles.actions}>
      <button type="button" className="btn btn-primary" disabled={busy || sessionContentDirty || !title.trim()} onClick={onCreate}>Crear programa <ArrowRight size={16} aria-hidden="true" /></button>
    </div>
    <ParticipantHandoutAction disabled={busy || sessionContentDirty || !title.trim()} hasSelection={selection.length > 0} onCreate={onHandout} />
  </section>;
}

function ParticipantHandoutAction({ disabled, hasSelection, onCreate }: {
  disabled: boolean;
  hasSelection: boolean;
  onCreate: () => void;
}) {
  return <details className={styles.participantMaterial}>
    <summary>Material para participantes</summary>
    <div>
      <p className={styles.meta}>Prepara una hoja editable con los horarios, las actividades, las lecturas y un espacio para tomar notas de las sesiones elegidas.</p>
      {!hasSelection && <p className={styles.meta}>Elige al menos una sesión de la Agenda para crear la hoja.</p>}
      <button type="button" className="btn btn-outline" disabled={disabled || !hasSelection} onClick={onCreate}>Crear hoja para participantes <ArrowRight size={16} aria-hidden="true" /></button>
    </div>
  </details>;
}
