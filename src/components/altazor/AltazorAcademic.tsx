"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpen, Check, GraduationCap, PenLine, Plus, Save } from "lucide-react";
import { createSubmissionKeys } from "@/lib/client-submission-key";
import { prepareAssistantSubmission } from "@/lib/altazor/client-send-policy";
import { ACADEMIC_LABELS, type AcademicMode } from "@/lib/altazor/academic-schemas";
import { ACADEMIC_INSTRUCTIONS, ACADEMIC_JOURNEYS, academicHref, academicJourney, type AcademicJourney } from "@/lib/altazor/academic-templates";
import { AltazorSources, type AltazorSelectedSource } from "./AltazorSources";
import { AltazorDiscovery } from "./AltazorDiscovery";
import { AcademicMatrix } from "./AcademicMatrix";
import { AcademicProfile } from "./AcademicProfile";
import { AcademicEditor } from "./AcademicEditor";
import { AcademicReview, type ReviewDestination } from "./AcademicReview";
import { academicApi as api, type AcademicArtifact, type AcademicOverview, type AcademicWorkspace } from "./academic-ui";
import styles from "./AltazorAcademic.module.css";

type Pane = "work" | "matrix" | "profile" | "discovery" | "review";
const kindLabels: Record<string, string> = { research: "Investigación", writing: "Escritura", course: "Docencia", career: "Carrera académica" };
const statusLabels: Record<string, string> = { prepared: "Lista para preparar", running: "En preparación", proposed: "Por revisar", reviewed: "Revisado", failed: "Necesita reintento", cancelled: "Detenida", interrupted: "Interrumpida" };
const message = (reason: unknown, fallback: string) => reason instanceof Error ? reason.message : fallback;
function replaceLink(workspaceId?: string, artifactId?: string) {
  if (window.location.pathname === "/academico") window.history.replaceState(null, "", academicHref(workspaceId, artifactId));
}
export function AltazorAcademic({ initialWorkspaceId = "", initialArtifactId = "" }: { initialWorkspaceId?: string; initialArtifactId?: string }) {
  const [overview, setOverview] = useState<AcademicOverview | null>(null), [workspace, setWorkspace] = useState<AcademicWorkspace | null>(null);
  const [journey, setJourney] = useState<AcademicJourney>("research"), [newTitle, setNewTitle] = useState(""), [mode, setMode] = useState<AcademicMode>("literature_review"), [step, setStep] = useState(0), [pane, setPane] = useState<Pane>("work");
  const [sources, setSources] = useState<AltazorSelectedSource[]>([]), [creating, setCreating] = useState(false), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [reviewCurrent, setReviewCurrent] = useState(false);
  const [selectedId, setSelectedId] = useState(""), [dirty, setDirty] = useState(false), [editorDirty, setEditorDirty] = useState(false), [profileDirty, setProfileDirty] = useState(false);
  const [causas, setCausas] = useState<{ id: string; titulo: string; rit: string | null }[]>([]);
  const createId = useRef(createSubmissionKeys()), prepareId = useRef(createSubmissionKeys()), currentWorkspace = useRef(""), mounted = useRef(true);
  const section = useRef<HTMLElement>(null);
  const blocked = busy || dirty || editorDirty || profileDirty;
  useEffect(() => {
    const controller = new AbortController(); mounted.current = true;
    void Promise.all([api<AcademicOverview>("/api/altazor/academic", undefined, "GET", controller.signal), api<{ causas?: typeof causas }>("/api/altazor/resources", undefined, "GET", controller.signal)])
      .then(async ([data, resources]) => {
        if (controller.signal.aborted) return;
        setOverview(data); setCausas(resources.causas || []);
        if (initialWorkspaceId) {
          currentWorkspace.current = initialWorkspaceId;
          const work = await api<AcademicWorkspace>(`/api/altazor/academic/${encodeURIComponent(initialWorkspaceId)}`, undefined, "GET", controller.signal);
          if (controller.signal.aborted) return;
          setWorkspace(work); setSources(work.sources || []); const kind = academicJourney(work.kind); setJourney(kind); setMode(work.brief.task);
          const artifact = initialArtifactId ? work.artifacts.find(item => item.id === initialArtifactId) : work.artifacts.find(item => item.available && ["proposed", "reviewed", "prepared"].includes(item.status || ""));
          if (artifact?.available) { setSelectedId(artifact.id); setStep(2); }
          else if (initialArtifactId) setError("Este resultado o sus fuentes ya no están disponibles. Puedes continuar con el resto del trabajo.");
        }
      }).catch(reason => { if (!controller.signal.aborted) setError(message(reason, "No se pudieron abrir tus trabajos. Inténtalo nuevamente.")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { mounted.current = false; controller.abort(); };
  }, [initialWorkspaceId, initialArtifactId]);
  useEffect(() => {
    if (!dirty && !editorDirty && !profileDirty) return;
    const leave = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", leave); return () => window.removeEventListener("beforeunload", leave);
  }, [dirty, editorDirty, profileDirty]);
  async function load(id: string) {
    const data = await api<AcademicWorkspace>(`/api/altazor/academic/${encodeURIComponent(id)}`);
    if (mounted.current && currentWorkspace.current === id) { setWorkspace(data); setSources(data.sources || []); setDirty(false); }
    return data;
  }
  async function chooseWorkspace(id: string, destination: "work" | "review" = "work") {
    if (blocked) return;
    if (destination === "review") { setPane("review"); setReviewCurrent(false); }
    setBusy(true); setError(""); setNotice(""); currentWorkspace.current = id;
    setSelectedId(""); setEditorDirty(false);
    try {
      const data = await load(id);
      setJourney(academicJourney(data.kind)); setMode(data.brief.task); setStep(0);
      setPane(destination); setReviewCurrent(destination === "review"); replaceLink(id);
    } catch (reason) {
      currentWorkspace.current = workspace?.id || "";
      setError(message(reason, "No se pudo abrir el trabajo."));
    } finally { setBusy(false); }
  }
  async function openReview() {
    if (blocked) return;
    if (workspace) await chooseWorkspace(workspace.id, "review");
    else { setReviewCurrent(false); setPane("review"); }
  }
  function actOnReview(destination: ReviewDestination) {
    if (blocked || !workspace) return;
    let focusSelector = "[aria-label='Pasos del trabajo académico']";
    if (destination.kind === "matrix") {
      setPane("matrix");
      focusSelector = "[data-academic-matrix]";
    } else {
      setPane("work");
      if (destination.kind === "artifact") {
        const artifact = workspace.artifacts.find(item => item.id === destination.id);
        if (!artifact) return;
        selectArtifact(artifact);
        focusSelector = "[aria-label='Editor académico']";
      } else {
        setStep(destination.kind === "objective" ? 0 : destination.kind === "sources" ? 1 : 2);
      }
    }
    window.requestAnimationFrame(() => {
      const target = section.current?.querySelector<HTMLElement>(focusSelector);
      target?.scrollIntoView({ block: "start" });
      const control = target?.querySelector<HTMLElement>("textarea:not([disabled]), [aria-current='step']")
        ?? target?.querySelector<HTMLElement>("select:not([disabled]), button:not([disabled])");
      control?.focus({ preventScroll: true });
    });
  }
  async function create() {
    if (!newTitle.trim() || blocked) return; setBusy(true); setError("");
    try {
      const result = await api<{ id: string }>("/api/altazor/academic", { requestId: createId.current.forPayload({ title: newTitle, kind: journey }), title: newTitle, kind: journey });
      currentWorkspace.current = result.id; await load(result.id); setSources([]); setSelectedId(""); setStep(0); setPane("work");
      setOverview(await api<AcademicOverview>("/api/altazor/academic")); setNewTitle(""); setCreating(false); createId.current = createSubmissionKeys(); setNotice("Trabajo creado. Comienza por tu objetivo."); replaceLink(result.id);
    } catch (reason) { setError(message(reason, "No se pudo crear el trabajo.")); } finally { setBusy(false); }
  }
  async function saveWorkspace() {
    if (!workspace) return false; if (!dirty) return true;
    setBusy(true); setError("");
    try {
      const result = await api<{ revision: number }>(`/api/altazor/academic/${workspace.id}`, { expectedRevision: workspace.revision, title: workspace.title, brief: workspace.brief, sources: sources.map(source => source.input), matrix: { dimensions: workspace.matrix.dimensions, rows: workspace.matrix.rows.map(({ id, title, included, cells }) => ({ id, title, included, cells })) } }, "PATCH");
      setWorkspace({ ...workspace, revision: result.revision }); setDirty(false); setNotice("Objetivo y cambios guardados.");
      setOverview(previous => previous ? { ...previous, workspaces: previous.workspaces.map(item => item.id === workspace.id ? { ...item, title: workspace.title } : item) } : previous);
      return true;
    } catch (reason) { setError(message(reason, "No se pudieron guardar los cambios.")); return false; } finally { setBusy(false); }
  }
  function updateWorkspace(change: Partial<AcademicWorkspace>) { if (workspace) { setWorkspace({ ...workspace, ...change }); setDirty(true); } }
  async function prepare(existingId?: string) {
    if (!workspace || !overview || dirty || editorDirty) return; setBusy(true); setError(""); setNotice("");
    let artifactId = existingId;
    try {
      if (!artifactId) {
        const payload = { expectedRevision: workspace.revision, mode, instruction: `${ACADEMIC_INSTRUCTIONS[mode]}\n\nEncargo del profesional:\n${workspace.brief.objective}`, sources: sources.map(source => source.input), ...prepareAssistantSubmission(overview.destination) };
        const result = await api<{ artifact: { id: string } }>(`/api/altazor/academic/${workspace.id}/artifacts`, { ...payload, requestId: prepareId.current.forPayload(payload) });
        artifactId = result.artifact.id; prepareId.current = createSubmissionKeys();
      }
      await load(workspace.id); setStep(2); setSelectedId(artifactId); replaceLink(workspace.id, artifactId);
      setNotice("ALTAZOR está preparando una propuesta. Puedes detenerla.");
      const artifact = await api<AcademicArtifact>(`/api/altazor/academic/${workspace.id}/artifacts/${artifactId}`, { action: "execute" });
      await load(workspace.id); setSelectedId(artifact.id); setNotice(["proposed", "reviewed"].includes(artifact.status || "") ? "Propuesta lista. Revisa el texto y sus fuentes." : "La preparación se detuvo. Conservamos su estado.");
    } catch (reason) { setError(message(reason, "No se pudo preparar la propuesta. Tus cambios guardados se conservan.")); await load(workspace.id).catch(() => {}); } finally { setBusy(false); }
  }
  const running = workspace?.artifacts.find(item => ["prepared", "running"].includes(item.status || ""));
  const selected = workspace?.artifacts.find(item => item.id === selectedId);
  function selectArtifact(artifact: AcademicArtifact) {
    if (editorDirty || busy || !artifact.available) return; setSelectedId(artifact.id); setStep(2); replaceLink(workspace?.id, artifact.id);
  }
  return <section ref={section} className={`${styles.root} altazor-academic`} aria-label="Desarrollo académico">
    <header className={styles.header}>
      <div>
        <h1>Académico</h1>
        <p>Investiga, escribe y prepara tus clases con las fuentes de cada trabajo a la vista.</p>
      </div>
      <Link href="/inicio" className="btn btn-ghost" onClick={event => { if (dirty || editorDirty || profileDirty) { event.preventDefault(); setNotice("Guarda los cambios antes de volver a ALTAZOR."); } }}>Pedir ayuda a Altazor</Link>
    </header>
    <nav className={styles.navigation} aria-label="Herramientas académicas">
      <button type="button" aria-current={pane === "work" ? "page" : undefined} disabled={profileDirty || editorDirty} onClick={() => setPane("work")}>Mis trabajos</button>
      <button type="button" aria-current={pane === "discovery" ? "page" : undefined} disabled={profileDirty || editorDirty} onClick={() => setPane("discovery")}>Buscar bibliografía</button>
      <button type="button" aria-current={pane === "review" ? "page" : undefined} disabled={blocked} onClick={() => void openReview()}>Mesa de revisión</button>
    </nav>
    {error && <div className={styles.error} role="alert"><p>{error}</p>{!overview && <button type="button" className="btn btn-outline" onClick={() => window.location.reload()}>Volver a cargar</button>}</div>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {loading ? <div className={styles.loading} role="status">Abriendo tus trabajos académicos…</div> : <>
      {pane === "discovery" && <>
        <p className={styles.discoveryHint}>Encuentra referencias y guárdalas en tu biblioteca. Para citar en un trabajo, vuelve a él y selecciona los pasajes que respaldan tu texto.</p>
        <AltazorDiscovery />
      </>}
      {pane === "review" && overview && <AcademicReview
        workspaces={overview.workspaces}
        workspace={reviewCurrent ? workspace : null}
        loading={busy}
        onChoose={id => void chooseWorkspace(id, "review")}
        onAction={actOnReview}
        onCreate={() => { setPane("work"); setCreating(true); }}
      />}
      {pane === "profile" && overview && <>
        <button className="btn btn-ghost" type="button" disabled={profileDirty} onClick={() => setPane("work")}><ArrowLeft size={16} aria-hidden="true" /> Volver al trabajo</button>
        <AcademicProfile overview={overview} onDirty={setProfileDirty} onSave={(profile, revision) => setOverview({ ...overview, profile, profileRevision: revision })}/>
      </>}
      {(pane === "work" || pane === "matrix") && <>
        {!workspace ? <>
          <div className={styles.projectHeading}><h2>Tus trabajos</h2>{Boolean(overview?.workspaces.length) && <button type="button" className="btn btn-primary" disabled={blocked} aria-expanded={creating} onClick={() => setCreating(value => !value)}><Plus size={17}/> {creating ? "Cerrar" : "Nuevo trabajo"}</button>}</div>
          {!creating && <section className={styles.guide} aria-label="Cómo trabajar en Académico">
            <ol>
              <li><strong>Define el objetivo</strong><span>Crea un trabajo y escribe tu pregunta, la tesis que quieres desarrollar o el propósito de la clase.</span></li>
              <li><strong>Reúne tus fuentes</strong><span>Busca bibliografía y elige los pasajes que sostendrán el trabajo. Usa la matriz para comparar las lecturas.</span></li>
              <li><strong>Revisa y exporta</strong><span>Pide una propuesta a Altazor, revisa el texto junto a sus citas y exporta tu versión.</span></li>
            </ol>
          </section>}
          {(creating || !overview?.workspaces.length) && <div className={styles.start}><div><h2>¿Qué quieres desarrollar?</h2><div className={styles.journeys} role="group" aria-label="Propósito del nuevo trabajo">{ACADEMIC_JOURNEYS.map((item, index) => {
            const Icon = [BookOpen, PenLine, GraduationCap][index];
            return <button key={item.id} type="button" aria-pressed={journey === item.id} disabled={busy} onClick={() => { setJourney(item.id); setMode(item.initialMode); }}><Icon size={21} aria-hidden="true"/><span><strong>{item.label}</strong><small>{item.description}</small></span><ArrowRight size={17} aria-hidden="true"/></button>;
          })}</div></div><form className={styles.create} onSubmit={event => { event.preventDefault(); void create(); }}><label>Nombre del trabajo<input value={newTitle} onChange={event => setNewTitle(event.target.value)} maxLength={200} placeholder={journey === "course" ? "Ej. Seminario de argumentación jurídica" : "Ej. Investigación sobre justicia ambiental"} required disabled={busy}/></label><button type="submit" className="btn btn-primary" disabled={busy || !overview || !newTitle.trim()}><Plus size={17}/> {busy ? "Creando…" : "Crear trabajo"}</button></form></div>}
          <section className={styles.projects} aria-label="Tus trabajos">{overview?.workspaces.length ? <ul>{overview.workspaces.map(item => <li key={item.id}><button type="button" disabled={blocked} onClick={() => void chooseWorkspace(item.id)}><span><strong>{item.title}</strong><small>{kindLabels[item.kind] || "Trabajo académico"}</small></span><ArrowRight size={18} aria-hidden="true"/></button></li>)}</ul> : <p>Tu primer trabajo aparecerá aquí. Podrás retomarlo con sus fuentes y propuestas.</p>}</section>
        </> : <>
          <div className={styles.workHeading}><button type="button" className="btn btn-ghost" disabled={blocked} onClick={() => { currentWorkspace.current = ""; setWorkspace(null); setSelectedId(""); setSources([]); setStep(0); setPane("work"); replaceLink(); }}><ArrowLeft size={16}/> Todos los trabajos</button><span>{dirty ? "Cambios sin guardar" : "Trabajo guardado"}</span>{dirty && <button type="button" className="btn btn-outline" disabled={busy} onClick={() => void saveWorkspace()}><Save size={15}/> Guardar cambios</button>}</div>
          {step === 0 && pane === "work" && <label className={styles.title}>Nombre del trabajo<input value={workspace.title} onChange={event => updateWorkspace({ title: event.target.value })} maxLength={200} disabled={busy}/></label>}
          {pane === "matrix" ? <><fieldset data-academic-matrix disabled={busy} style={{border:0,padding:0,minWidth:0}}><legend className="sr-only">Matriz académica</legend><AcademicMatrix title={workspace.title} matrix={workspace.matrix} sources={sources} onChange={matrix => updateWorkspace({ matrix })}/></fieldset><button type="button" className="btn btn-outline" onClick={() => setPane("work")}>Volver al trabajo</button></> : <>
            <nav className={styles.steps} aria-label="Pasos del trabajo académico">{["Objetivo", "Fuentes", "Trabajo"].map((label, index) => <button key={label} type="button" aria-current={step === index ? "step" : undefined} disabled={busy || (editorDirty && index !== 2)} onClick={() => setStep(index)}><span aria-hidden="true">{index < step ? <Check size={16}/> : index + 1}</span>{label}</button>)}</nav>
            {step === 0 && <div className={styles.objective}><label>Tu objetivo o texto de trabajo<textarea rows={7} value={workspace.brief.objective} disabled={busy} onChange={event => updateWorkspace({ brief: { ...workspace.brief, objective: event.target.value } })} maxLength={8000} placeholder={ACADEMIC_INSTRUCTIONS[mode]}/></label><details><summary>Opciones del trabajo</summary><div className={styles.brief}><label>Qué quieres preparar<select aria-label="Qué quieres preparar" value={mode} disabled={busy} onChange={event => { setMode(event.target.value as AcademicMode); updateWorkspace({ brief: { ...workspace.brief, task: event.target.value as AcademicMode } }); }}>{ACADEMIC_JOURNEYS.map(item => <optgroup key={item.id} label={item.label}>{item.modes.map(id => <option key={id} value={id}>{ACADEMIC_LABELS[id]}</option>)}</optgroup>)}</select></label>{(["audience", "language", ...(["syllabus", "rubric", "teaching_material"].includes(mode) ? ["duration", "learningOutcomes", "evaluation"] as const : [])] as const).map(key => <label key={key}>{{ audience: "Destinatarios", language: "Idioma", duration: "Duración", learningOutcomes: "Resultados de aprendizaje", evaluation: "Evaluación o actividad" }[key]}<textarea value={workspace.brief[key]} rows={key === "language" || key === "duration" ? 1 : 3} maxLength={key === "language" ? 80 : key === "duration" ? 100 : key === "audience" ? 1000 : 6000} disabled={busy} onChange={event => updateWorkspace({ brief: { ...workspace.brief, [key]: event.target.value } })}/></label>)}</div></details>{mode === "cv" && <button className="btn btn-outline" type="button" disabled={busy || editorDirty} onClick={() => setPane("profile")}>Completar perfil para el currículum</button>}<button type="button" className="btn btn-primary" disabled={busy || !workspace.brief.objective.trim()} onClick={() => { void saveWorkspace().then(saved => { if (saved) setStep(1); }); }}>{dirty ? "Guardar y elegir fuentes" : "Elegir fuentes"}<ArrowRight size={16}/></button></div>}
            {step === 1 && <div className={styles.sourceStep}>{workspace.unavailableSources > 0 && <p role="status">{workspace.unavailableSources} pasajes guardados ya no están disponibles. Elige las fuentes que quieres conservar para el próximo encargo; las propuestas anteriores mantienen su respaldo original.</p>}<AltazorSources selected={sources} onChange={value => { setSources(value); setDirty(true); }}/>{sources.length > 0 && <button type="button" className={styles.matrixShortcut} disabled={busy} onClick={() => setPane("matrix")}>Comparar lecturas en la matriz</button>}<div className={styles.next}><button type="button" className="btn btn-outline" onClick={() => setStep(0)}><ArrowLeft size={16}/> Objetivo</button><button type="button" className="btn btn-primary" disabled={busy} onClick={() => { void saveWorkspace().then(saved => { if (saved) setStep(2); }); }}>{dirty ? "Guardar fuentes y continuar" : "Continuar al trabajo"}<ArrowRight size={16}/></button></div></div>}
            {step === 2 && <>
              <div className={styles.prepare}><div><h2>{ACADEMIC_LABELS[mode]}</h2><p>{sources.length ? `${sources.length} ${sources.length === 1 ? "pasaje elegido" : "pasajes elegidos"}` : "Sin pasajes elegidos"} · <button type="button" disabled={editorDirty || busy} onClick={() => setStep(1)}>Cambiar fuentes</button></p></div><p>{workspace.brief.objective || "Vuelve a Objetivo para indicar tu encargo."}</p>
                <button type="button" className="btn btn-primary" disabled={busy || dirty || editorDirty || !workspace.brief.objective.trim() || !overview?.destination.permitted} onClick={() => void prepare()}>{busy ? "Preparando…" : "Preparar propuesta"}</button>{dirty && <p role="status">Guarda tus cambios antes de preparar otra propuesta.</p>}{overview && !overview.destination.permitted && <p>Configura un proveedor de IA en <a href="/configuracion">Configuración</a> para preparar propuestas.</p>}
              </div>
              {workspace.artifacts.length > 0 && <section className={styles.results}><h2>Propuestas del trabajo</h2><ul>{workspace.artifacts.map(artifact => <li key={artifact.id}><button type="button" disabled={!artifact.available || busy || Boolean(editorDirty && artifact.id !== selectedId)} aria-current={selectedId === artifact.id ? "true" : undefined} onClick={() => selectArtifact(artifact)}><span>{artifact.available ? artifact.title : "Resultado cuyo respaldo ya no está disponible"}</span><small>{statusLabels[artifact.status || ""] || "No disponible"}</small></button></li>)}</ul></section>}
              {selected?.available && selected.status === "prepared" && <div className={styles.prepared}><p>Este encargo está guardado y aún no se ha enviado al proveedor.</p><button type="button" className="btn btn-primary" disabled={busy} onClick={() => void prepare(selected.id)}>Ejecutar encargo guardado</button></div>}
              {selected?.available && ["proposed", "reviewed"].includes(selected.status || "") && <AcademicEditor key={selected.id} workspaceId={workspace.id} artifact={selected} causas={causas} onDirty={setEditorDirty} onSaved={artifact => setWorkspace(current => current ? { ...current, artifacts: current.artifacts.map(item => item.id === artifact.id ? artifact : item) } : current)} onSelectionTask={(text, nextMode) => { if (text.length > 7000) { setError("Elige hasta 7.000 caracteres para preparar una revisión de la selección."); return; } setMode(nextMode); updateWorkspace({ brief: { ...workspace.brief, objective: text, task: nextMode } }); setStep(0); setNotice("Selección copiada al objetivo. Guarda el encargo y prepara otra propuesta; el original se conserva."); }}/>}
            </>}
          </>}
        </>}
      </>}
    </>}
    {running && workspace && <div className={styles.running} role="status"><span>{running.status === "prepared" ? "Encargo conservado, pendiente de ejecución" : "ALTAZOR está preparando tu propuesta"}</span><button type="button" className="btn btn-outline" onClick={() => { void api(`/api/altazor/academic/${workspace.id}/artifacts/${running.id}`, { action: "cancel" }).then(() => load(workspace.id)).then(() => setNotice("Preparación detenida.")).catch(reason => setError(message(reason, "No se pudo detener la preparación."))); }}>Detener</button></div>}
    {profileDirty && <p role="status">Guarda tu perfil antes de cambiar de apartado.</p>}
  </section>;
}
