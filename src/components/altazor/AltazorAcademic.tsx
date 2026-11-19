"use client";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import Link from "next/link";
import { EditorialHeading } from "@/components/ui/EditorialHeading";
import { FolioSymbol } from "@/components/ui/FolioSymbol";
import { ArrowLeft, ArrowRight, BookOpen, FileText, GraduationCap, PenLine, Plus, Save, Search } from "lucide-react";
import { createSubmissionKeys } from "@/lib/client-submission-key";
import { prepareAssistantSubmission } from "@/lib/altazor/client-send-policy";
import { ACADEMIC_LABELS, type AcademicMode } from "@/lib/altazor/academic-schemas";
import { ACADEMIC_INSTRUCTIONS, ACADEMIC_JOURNEYS, ACADEMIC_MANUSCRIPT_TEMPLATES, ACADEMIC_MANUSCRIPT_TEMPLATE_IDS, academicHref, academicJourney, academicLocation, type AcademicPane, isAcademicTeachingKind, isAcademicTeachingProgram, isAcademicTeachingSessionKind, type AcademicJourney, type AcademicManuscriptTemplate } from "@/lib/altazor/academic-templates";
import { AltazorSources, type AltazorSelectedSource } from "./AltazorSources";
import { AltazorDiscovery } from "./AltazorDiscovery";
import { AcademicMatrix } from "./AcademicMatrix";
import { AcademicProfile } from "./AcademicProfile";
import { AcademicEditor } from "./AcademicEditor";
import { AcademicReview, type ReviewDestination } from "./AcademicReview";
import { AcademicCallForm, AcademicSyllabusForm, AcademicTeaching, AcademicTeachingProgram, type TeachingTemplate } from "./AcademicTeaching";
import { AcademicTeachingSessions } from "./AcademicTeachingSessions";
import { academicApi as api, type AcademicArtifact, type AcademicOverview, type AcademicProject, type AcademicWorkspace } from "./academic-ui";
import styles from "./AltazorAcademic.module.css";

const kindLabels: Record<string, string> = { research: "Investigación", writing: "Escritura", course: "Curso", seminar: "Seminario", congress: "Congreso", workshop: "Taller", call: "Convocatoria", career: "Carrera académica" };
const statusLabels: Record<string, string> = { prepared: "Lista para preparar", running: "En preparación", proposed: "Por revisar", reviewed: "Revisado", failed: "Necesita reintento", cancelled: "Detenida", interrupted: "Interrumpida" };
const journeyIcons = { research: BookOpen, writing: PenLine, course: GraduationCap };
const workSteps = [{ label: "Objetivo", icon: PenLine }, { label: "Fuentes", icon: BookOpen }, { label: "Trabajo", icon: FileText }];
const searchTitle = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
const message = (reason: unknown, fallback: string) => reason instanceof Error ? reason.message : fallback;
export function AltazorAcademic({ initialLocation }: { initialLocation: ReturnType<typeof academicLocation> }) {
  const { workspaceId: initialWorkspaceId, artifactId: initialArtifactId, pane: initialPane, step: initialStep } = initialLocation;
  const [overview, setOverview] = useState<AcademicOverview | null>(null), [workspace, setWorkspace] = useState<AcademicWorkspace | null>(null);
  const [journey, setJourney] = useState<AcademicJourney>("research"), [newTitle, setNewTitle] = useState(""), [mode, setMode] = useState<AcademicMode>("literature_review"), [step, setStep] = useState(initialStep ?? 0), [pane, setPane] = useState<AcademicPane>(initialPane);
  const [sources, setSources] = useState<AltazorSelectedSource[]>([]), [sourcesChanged, setSourcesChanged] = useState(false), [creating, setCreating] = useState(false), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [reviewCurrent, setReviewCurrent] = useState(initialPane === "review" && !!initialWorkspaceId), [projectQuery, setProjectQuery] = useState(""), [stopping, setStopping] = useState(false);
  const [template, setTemplate] = useState<AcademicManuscriptTemplate>("blank");
  const [teachingStart, setTeachingStart] = useState<TeachingTemplate | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [discoveryQuery, setDiscoveryQuery] = useState("");
  const [bibliographyDraft, setBibliographyDraft] = useState(false);
  const [teachingSessionsVersion, setTeachingSessionsVersion] = useState(0);
  const [sessionContentDirty, setSessionContentDirty] = useState(false);
  const [selectedId, setSelectedId] = useState(""), [dirty, setDirty] = useState(false), [editorDirty, setEditorDirty] = useState(false), [profileDirty, setProfileDirty] = useState(false);
  const [causas, setCausas] = useState<{ id: string; titulo: string; rit: string | null }[]>([]);
  const createId = useRef(createSubmissionKeys()), prepareId = useRef(createSubmissionKeys()), currentWorkspace = useRef(""), mounted = useRef(true);
  const section = useRef<HTMLElement>(null);
  const projectSearch = useRef<HTMLInputElement>(null);
  const blocked = busy || stopping || dirty || editorDirty || profileDirty || sessionContentDirty;
  const draft = bibliographyDraft || dirty || editorDirty || profileDirty || sessionContentDirty || (!workspace && newTitle.trim() !== "");
  const lastLocation = useRef<{ href: string; state: { academicIndex?: number } | null } | null>(null);
  function rememberLocation() {
    lastLocation.current = { href: window.location.href, state: window.history.state };
  }
  function navigate(href: string) {
    if (window.location.pathname !== "/academico") return;
    if (new URL(href, window.location.href).href !== window.location.href) {
      const index = window.history.state?.academicIndex ?? 0;
      window.history.pushState({ academicIndex: index + 1 }, "", href);
    }
    rememberLocation();
  }
  function changePane(next: AcademicPane) {
    setPane(next);
    navigate(academicHref(workspace?.id, selectedId, next, workspace ? step : undefined));
  }
  function changeStep(next: number) {
    setStep(next);
    navigate(academicHref(workspace?.id, selectedId, "work", next));
  }
  const restoreLocation = useEffectEvent((event: PopStateEvent) => {
    const previous = lastLocation.current;
    if (previous?.href === window.location.href) return;
    if ((draft || busy || stopping) && previous) {
      event.stopImmediatePropagation();
      const from = previous.state?.academicIndex;
      const to = event.state?.academicIndex;
      if (typeof from === "number" && typeof to === "number" && from !== to) window.history.go(from - to);
      else window.history.pushState(previous.state, "", previous.href);
      setNotice(draft ? "Guarda los cambios antes de salir de esta vista." : "Espera a que termine la operación.");
      return;
    }
    if (window.location.pathname !== "/academico") return;
    const restored = academicLocation(Object.fromEntries(new URLSearchParams(window.location.search)));
    if (restored.workspaceId !== currentWorkspace.current) {
      // Reabrir desde la ruta vuelve a comprobar el acceso al trabajo solicitado.
      window.location.reload();
      return;
    }
    setPane(restored.pane); setReviewCurrent(restored.pane === "review" && !!restored.workspaceId);
    const artifact = workspace?.artifacts.find(item => item.id === restored.artifactId && item.available);
    setSelectedId(artifact?.id || "");
    setStep(restored.step ?? (artifact ? 2 : 0));
    if (restored.artifactId && !artifact) setError("Este resultado o sus fuentes ya no están disponibles.");
    else setError("");
    setNotice(""); rememberLocation();
  });
  useEffect(() => {
    if (typeof window.history.state?.academicIndex !== "number") {
      window.history.replaceState({ ...window.history.state, academicIndex: 0 }, "", window.location.href);
    }
    rememberLocation();
    const restore = (event: PopStateEvent) => restoreLocation(event);
    window.addEventListener("popstate", restore, true);
    window.addEventListener("hashchange", rememberLocation);
    return () => { window.removeEventListener("popstate", restore, true); window.removeEventListener("hashchange", rememberLocation); };
  }, []);
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
          setWorkspace(work); setSources(work.sources || []); setSourcesChanged(false); const kind = academicJourney(work.kind); setJourney(kind); setMode(work.brief.task);
          const artifact = initialArtifactId ? work.artifacts.find(item => item.id === initialArtifactId) : work.artifacts.find(item => item.available && ["proposed", "reviewed", "prepared"].includes(item.status || ""));
          const hash = window.location.hash;
          const teachingAnchor = isAcademicTeachingKind(work.kind)
            && (["#agenda-docencia", "#encargos-comite", "#reuniones-comite"].includes(hash) || hash.startsWith("#encargo-"));
          if (artifact?.available && !teachingAnchor) { setSelectedId(artifact.id); setStep(initialStep ?? 2); }
          else if (initialArtifactId && !artifact?.available) setError("Este resultado o sus fuentes ya no están disponibles. Puedes continuar con el resto del trabajo.");
        }
      }).catch(reason => { if (!controller.signal.aborted) setError(message(reason, "No se pudieron abrir tus trabajos. Inténtalo nuevamente.")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { mounted.current = false; controller.abort(); };
  }, [initialWorkspaceId, initialArtifactId, initialStep]);
  useEffect(() => {
    if (!loading && pane === "teaching" && window.location.hash === "#convocatorias-oficiales") {
      document.getElementById("convocatorias-oficiales")?.scrollIntoView({ block: "start" });
    }
  }, [pane, loading]);
  useEffect(() => {
    if (!draft) return;
    const leave = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", leave); return () => window.removeEventListener("beforeunload", leave);
  }, [draft]);
  async function load(id: string, onlyProposals = false) {
    const data = await api<AcademicWorkspace>(`/api/altazor/academic/${encodeURIComponent(id)}`);
    if (mounted.current && currentWorkspace.current === id) {
      if (onlyProposals) {
        setWorkspace(current => current?.id === id ? { ...current, artifacts: data.artifacts } : current);
      } else {
        setWorkspace(data);
        setSources(data.sources || []);
        setSourcesChanged(false);
        setDirty(false);
      }
    }
    return data;
  }
  async function chooseWorkspace(id: string, destination: "work" | "review" = "work") {
    if (blocked || draft) return;
    if (destination === "review") { setPane("review"); setReviewCurrent(false); }
    setBusy(true); setError(""); setNotice(""); currentWorkspace.current = id;
    setSelectedId(""); setEditorDirty(false);
    try {
      const data = await load(id);
      setJourney(academicJourney(data.kind)); setMode(data.brief.task); setStep(0); setShowTemplates(false);
      setPane(destination); setReviewCurrent(destination === "review"); navigate(academicHref(id, undefined, destination, 0));
    } catch (reason) {
      currentWorkspace.current = workspace?.id || "";
      setError(message(reason, "No se pudo abrir el trabajo."));
    } finally { setBusy(false); }
  }
  async function openReview() {
    if (blocked) return;
    if (workspace) {
      setBusy(true); setError("");
      try {
        const fresh = await load(workspace.id);
        setReviewCurrent(true);
        if (selectedId && !fresh.artifacts.some(item => item.id === selectedId && item.available)) {
          setSelectedId(""); setStep(0); setPane("review");
          navigate(academicHref(workspace.id, undefined, "review", 0));
        } else changePane("review");
      } catch (reason) { setError(message(reason, "No se pudo abrir la revisión.")); }
      finally { setBusy(false); }
    } else { setReviewCurrent(false); changePane("review"); }
  }
  function actOnReview(destination: ReviewDestination) {
    if (blocked || !workspace) return;
    let focusSelector = "[aria-label='Pasos del trabajo académico']";
    if (destination.kind === "matrix") {
      changePane("matrix");
      focusSelector = "[data-academic-matrix]";
    } else {
      setPane("work");
      if (destination.kind === "artifact") {
        const artifact = workspace.artifacts.find(item => item.id === destination.id);
        if (!artifact) return;
        selectArtifact(artifact);
        focusSelector = "[aria-label='Editor académico']";
      } else {
        changeStep(destination.kind === "objective" ? 0 : destination.kind === "sources" ? 1 : 2);
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
      const payload = { title: newTitle, kind: teachingStart || journey };
      const result = await api<{ id: string }>("/api/altazor/academic", { ...payload, requestId: createId.current.forPayload(payload) });
      currentWorkspace.current = result.id;
      const data = await load(result.id);
      rememberProject({ id: data.id, title: data.title, kind: data.kind });
      setJourney(academicJourney(data.kind)); setMode(data.brief.task);
      setSelectedId(""); setStep(0); setPane("work"); setNewTitle(""); setCreating(false);
      setShowTemplates(false); setTemplate(teachingStart || "blank"); setTeachingStart(null);
      createId.current = createSubmissionKeys();
      setNotice(isAcademicTeachingProgram(data.kind) ? "Trabajo creado. Ya puedes preparar el programa." : "Trabajo creado. Comienza por tu objetivo.");
      navigate(academicHref(result.id));
    } catch (reason) { setError(message(reason, "No se pudo crear el trabajo.")); } finally { setBusy(false); }
  }
  async function saveWorkspace() {
    if (!workspace) return null; if (!dirty) return workspace.revision;
    setBusy(true); setError("");
    try {
      const result = await api<{ revision: number }>(`/api/altazor/academic/${workspace.id}`, {
        expectedRevision: workspace.revision, title: workspace.title, brief: workspace.brief,
        ...(sourcesChanged ? { sources: sources.map(source => source.input) } : {}),
        matrix: { dimensions: workspace.matrix.dimensions, rows: workspace.matrix.rows.map(({ id, title, included, cells }) => ({ id, title, included, cells })) },
      }, "PATCH");
      setWorkspace(current => current?.id === workspace.id ? {
        ...current, revision: result.revision, unavailableSources: sourcesChanged ? 0 : current.unavailableSources,
      } : current);
      setSourcesChanged(false); setDirty(false); setNotice("Objetivo y cambios guardados.");
      rememberProject({ id: workspace.id, title: workspace.title, kind: workspace.kind, call: workspace.brief.call });
      return result.revision;
    } catch (reason) { setError(message(reason, "No se pudieron guardar los cambios.")); return null; } finally { setBusy(false); }
  }
  function updateWorkspace(change: Partial<AcademicWorkspace>) { if (workspace) { setWorkspace({ ...workspace, ...change }); setDirty(true); } }
  function rememberProject(project: AcademicProject) {
    setOverview(previous => previous ? {
      ...previous,
      workspaces: [project, ...previous.workspaces.filter(item => item.id !== project.id)],
    } : previous);
  }
  function startTeaching(next: TeachingTemplate) {
    if (blocked) return;
    currentWorkspace.current = "";
    setWorkspace(null); setSelectedId(""); setSources([]); setStep(0);
    setTeachingStart(next); setJourney("course"); setMode("syllabus");
    setNewTitle(""); setCreating(true); setPane("work"); setNotice(""); setError(""); navigate(academicHref());
  }
  const draftRequest = useRef(createSubmissionKeys());
  const agreementConversion = useRef(false);
  async function convertAgreement(meetingId: string, agreementId: string) {
    if (!workspace || busy || editorDirty || sessionContentDirty || agreementConversion.current) return;
    agreementConversion.current = true;
    try {
      const revision = await saveWorkspace();
      if (revision === null) return;
      setBusy(true); setError(""); setNotice("");
      const result = await api<{ actionId: string; revision: number; reused: boolean }>(`/api/altazor/academic/${workspace.id}/committee-agreements`, {
        expectedRevision: revision, meetingId, agreementId,
      });
      await load(workspace.id);
      if (!mounted.current || currentWorkspace.current !== workspace.id) return;
      setNotice(result.reused ? "Este acuerdo ya tiene un encargo. Puedes continuar con su seguimiento." : "Encargo creado. Completa su responsable y su fecha cuando corresponda.");
      navigate(`${academicHref(workspace.id)}#encargo-${result.actionId}`);
      window.dispatchEvent(new Event("hashchange"));
    } catch (reason) {
      setError(message(reason, "No se pudo crear el encargo del acuerdo. Vuelve a intentarlo."));
    } finally { agreementConversion.current = false; setBusy(false); }
  }
  async function createDraft(next: AcademicManuscriptTemplate) {
    if (!workspace || busy || editorDirty || sessionContentDirty || !workspace.title.trim()) return;
    const revision = await saveWorkspace();
    if (revision === null) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const payload = { expectedRevision: revision, template: next };
      const result = await api<{ id: string }>(`/api/altazor/academic/${workspace.id}/artifacts/draft`, { ...payload, requestId: draftRequest.current.forPayload({ id: workspace.id, ...payload }) });
      await load(workspace.id);
      draftRequest.current = createSubmissionKeys();
      setSelectedId(result.id); setStep(2); setShowTemplates(false); navigate(academicHref(workspace.id, result.id));
      const label = next === "course" ? "Syllabus creado"
        : next === "participant_handout" ? "Hoja para participantes creada"
        : next === workspace.kind && isAcademicTeachingProgram(next) ? "Programa creado" : "Borrador creado";
      setNotice(`${label}. Ya puedes editarlo.`);
      window.requestAnimationFrame(() => section.current?.querySelector("[aria-label='Editor académico']")?.scrollIntoView({ block: "start" }));
    } catch (reason) { setError(message(reason, "No se pudo abrir el borrador. Inténtalo de nuevo.")); }
    finally { setBusy(false); }
  }
  async function prepare(existingId?: string) {
    if (!workspace || !overview || blocked) return; setBusy(true); setError(""); setNotice("");
    let artifactId = existingId;
    try {
      if (!artifactId) {
        const payload = { expectedRevision: workspace.revision, mode, instruction: `${ACADEMIC_INSTRUCTIONS[mode]}\n\nEncargo del profesional:\n${workspace.brief.objective}`, sources: sources.map(source => source.input), ...prepareAssistantSubmission(overview.destination) };
        const result = await api<{ artifact: { id: string } }>(`/api/altazor/academic/${workspace.id}/artifacts`, { ...payload, requestId: prepareId.current.forPayload(payload) });
        artifactId = result.artifact.id; prepareId.current = createSubmissionKeys();
      }
      await load(workspace.id); setStep(2); setSelectedId(artifactId); navigate(academicHref(workspace.id, artifactId));
      setNotice("ALTAZOR está preparando una propuesta. Puedes detenerla.");
      const artifact = await api<AcademicArtifact>(`/api/altazor/academic/${workspace.id}/artifacts/${artifactId}`, { action: "execute" });
      await load(workspace.id); setSelectedId(artifact.id); setNotice(["proposed", "reviewed"].includes(artifact.status || "") ? "Propuesta lista. Revisa el texto y sus fuentes." : "La preparación se detuvo. Conservamos su estado.");
    } catch (reason) {
      const latest = await load(workspace.id, true).catch(() => undefined);
      if (latest?.artifacts.some(item => item.id === artifactId && item.status === "cancelled")) {
        setNotice("Preparación detenida.");
      } else {
        setError(message(reason, "No se pudo preparar la propuesta. Tus cambios guardados se conservan."));
      }
    } finally { setBusy(false); }
  }
  const running = workspace?.artifacts.find(item => ["prepared", "running"].includes(item.status || ""));
  const selected = workspace?.artifacts.find(item => item.id === selectedId);
  const programKind = workspace && isAcademicTeachingProgram(workspace.kind) ? workspace.kind : null;
  const matrixEvidenceRows = workspace?.matrix.rows.filter(row =>
    row.included && row.available !== false && Object.values(row.cells).some(cell => cell.source)
  ).length || 0;
  const projects = overview?.workspaces || [];
  const query = searchTitle(projectQuery);
  const visibleProjects = query ? projects.filter(item => searchTitle(item.title).includes(query)) : projects;

  async function stopPreparation() {
    if (!workspace || !running || stopping) return;
    setStopping(true); setError("");
    try {
      await api(`/api/altazor/academic/${workspace.id}/artifacts/${running.id}`, { action: "cancel" });
      const latest = await load(workspace.id, true);
      setNotice(latest.artifacts.some(item => item.id === running.id && item.status === "cancelled")
        ? "Preparación detenida."
        : "Se actualizó el estado del encargo.");
    } catch (reason) {
      setError(message(reason, "No se pudo detener la preparación."));
    } finally { setStopping(false); }
  }
  function selectArtifact(artifact: AcademicArtifact) {
    if (editorDirty || busy || !artifact.available) return; setSelectedId(artifact.id); setStep(2); navigate(academicHref(workspace?.id, artifact.id));
  }
  return <section ref={section} className={`${styles.root} altazor-academic`} aria-label="Desarrollo académico">
    <header className={styles.header}>
      <EditorialHeading artwork="academic">
        <h1>Académico</h1>
      </EditorialHeading>
      <Link href="/inicio" className="btn btn-ghost" onClick={event => { if (draft) { event.preventDefault(); setNotice("Guarda los cambios antes de volver a ALTAZOR."); } }}>Pedir ayuda a Altazor</Link>
    </header>
    <nav className={styles.navigation} aria-label="Herramientas académicas">
      <button type="button" aria-current={pane === "work" ? "page" : undefined} disabled={blocked || draft} onClick={() => changePane("work")}>Mis trabajos</button>
      <button type="button" aria-current={pane === "discovery" ? "page" : undefined} disabled={blocked || draft} onClick={() => { setDiscoveryQuery(""); changePane("discovery"); }}>Buscar bibliografía</button>
      <button type="button" aria-current={pane === "teaching" ? "page" : undefined} disabled={blocked || draft} onClick={() => changePane("teaching")}>Docencia</button>
      <button type="button" aria-current={pane === "review" ? "page" : undefined} disabled={blocked || draft} onClick={() => void openReview()}>Mesa de revisión</button>
    </nav>
    {error && <div className={styles.error} role="alert"><p>{error}</p>{!overview && <button type="button" className="btn btn-outline" onClick={() => window.location.reload()}>Volver a cargar</button>}</div>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {loading ? <div className={styles.loading} role="status">Abriendo tus trabajos académicos…</div> : <>
      {pane === "discovery" && <>
        <p className={styles.discoveryHint}>Guarda las referencias en Mi bibliografía. Para citar un pasaje, incorpora el texto a tu biblioteca y selecciónalo en el trabajo.</p>
        <AltazorDiscovery initialQuery={discoveryQuery} onDraftChange={setBibliographyDraft} />
      </>}
      {pane === "teaching" && <AcademicTeaching projects={projects.filter(item => isAcademicTeachingKind(item.kind))} blocked={blocked} onStart={startTeaching} onOpen={id => void chooseWorkspace(id)} onSaved={rememberProject} />}
      {pane === "review" && overview && <AcademicReview
        workspaces={overview.workspaces}
        workspace={reviewCurrent ? workspace : null}
        loading={busy}
        onChoose={id => void chooseWorkspace(id, "review")}
        onAction={actOnReview}
        onCreate={() => { changePane("work"); setCreating(true); }}
      />}
      {pane === "profile" && overview && <>
        <button className="btn btn-ghost" type="button" disabled={profileDirty} onClick={() => changePane("work")}><ArrowLeft size={16} aria-hidden="true" /> Volver al trabajo</button>
        <AcademicProfile overview={overview} onDirty={setProfileDirty} onSave={(profile, revision) => setOverview({ ...overview, profile, profileRevision: revision })}/>
      </>}
      {(pane === "work" || pane === "matrix") && <>
        {!workspace ? <>
          <section className={styles.projects} aria-labelledby="academic-projects-title">
            <div className={styles.projectHeading}>
              <h2 id="academic-projects-title">Tus trabajos</h2>
              {projects.length > 0 && <button type="button" className="btn btn-primary" disabled={blocked} aria-expanded={creating} onClick={() => { if (creating) setNewTitle(""); setCreating(value => !value); }}>
                {!creating && <Plus size={17} aria-hidden="true"/>} {creating ? (newTitle.trim() ? "Descartar título" : "Cerrar") : "Nuevo trabajo"}
              </button>}
            </div>
            {(creating || !projects.length) && <div className={styles.start}>
              <div>
                <h3>{teachingStart ? `Nuevo trabajo · ${ACADEMIC_MANUSCRIPT_TEMPLATES[teachingStart].label}` : "¿Qué quieres desarrollar?"}</h3>
                <div className={styles.journeys} role="group" aria-label="Propósito del nuevo trabajo">{ACADEMIC_JOURNEYS.map(item => {
                  const Icon = journeyIcons[item.id];
                  return <button key={item.id} type="button" aria-pressed={journey === item.id} disabled={busy} onClick={() => { setTeachingStart(null); setJourney(item.id); setMode(item.initialMode); }}>
                    <Icon size={21} aria-hidden="true"/><span><strong>{item.label}</strong><small>{item.description}</small></span>
                    <ArrowRight size={17} aria-hidden="true"/>
                  </button>;
                })}</div>
              </div>
              <form className={styles.create} onSubmit={event => { event.preventDefault(); void create(); }}>
                <label>Nombre del trabajo<input value={newTitle} onChange={event => setNewTitle(event.target.value)} maxLength={200}
                  placeholder={journey === "course" ? "Ej. Seminario de argumentación jurídica" : "Ej. Investigación sobre justicia ambiental"} required disabled={busy}/></label>
                <button type="submit" className="btn btn-primary" disabled={busy || !overview || !newTitle.trim()}>
                  <Plus size={17} aria-hidden="true"/> {busy ? "Creando…" : "Crear trabajo"}
                </button>
              </form>
            </div>}
            {projects.length > 0 && <>
              <label className={styles.projectSearch}>
                <span>Buscar por título</span>
                <span><Search size={17} aria-hidden="true"/><input ref={projectSearch} type="search" value={projectQuery} onChange={event => setProjectQuery(event.target.value)}/></span>
              </label>
              {visibleProjects.length ? <ul>{visibleProjects.map(item => {
                const Icon = journeyIcons[academicJourney(item.kind)];
                return <li key={item.id}><button type="button" className={styles.projectLink} disabled={blocked || draft} onClick={() => void chooseWorkspace(item.id)}>
                  <Icon size={20} aria-hidden="true" />
                  <span><strong>{item.title}</strong><small>{kindLabels[item.kind] || "Trabajo académico"}</small></span>
                  <ArrowRight size={17} aria-hidden="true"/>
                </button></li>;
              })}</ul> : <div className={styles.noProjects}>
                <p role="status">No hay trabajos con ese título.</p>
                <button type="button" className="btn btn-ghost" onClick={() => { setProjectQuery(""); projectSearch.current?.focus(); }}>Limpiar búsqueda</button>
              </div>}
            </>}
            <details className={styles.guide}>
              <summary>Cómo trabajar en Académico</summary>
              <ol>
                <li><strong>Define el objetivo</strong><span>Escribe la pregunta, la tesis o el propósito de la clase.</span></li>
                <li><strong>Reúne tus fuentes</strong><span>Elige pasajes y compara las lecturas en la matriz.</span></li>
                <li><strong>Revisa y exporta</strong><span>Coteja el texto con sus fuentes antes de descargar tu versión.</span></li>
              </ol>
            </details>
          </section>
        </> : <>
          <div className={styles.workHeading}><button type="button" className="btn btn-ghost" disabled={blocked} onClick={() => { currentWorkspace.current = ""; setWorkspace(null); setSelectedId(""); setSources([]); setStep(0); setPane("work"); navigate(academicHref()); }}><ArrowLeft size={16}/> Todos los trabajos</button><span>{dirty ? "Cambios sin guardar" : "Trabajo guardado"}</span>{dirty && <button type="button" className="btn btn-outline" disabled={busy} onClick={() => void saveWorkspace()}><Save size={15}/> Guardar cambios</button>}</div>
          <header className={styles.workFolio}>
            <FolioSymbol variant="evidence" className={styles.workFolioMark} />
            <div><h2>{workspace.title.trim() || "Trabajo sin título"}</h2><p>{kindLabels[workspace.kind] || "Trabajo académico"}</p></div>
          </header>
          {step === 0 && pane === "work" && <label className={styles.title}>Nombre del trabajo<input value={workspace.title} onChange={event => updateWorkspace({ title: event.target.value })} maxLength={200} disabled={busy}/></label>}
          {pane === "matrix" ? <><fieldset data-academic-matrix disabled={busy} style={{border:0,padding:0,minWidth:0}}><legend className="sr-only">Matriz académica</legend><AcademicMatrix title={workspace.title} matrix={workspace.matrix} sources={sources} onChange={matrix => updateWorkspace({ matrix })}/></fieldset><button type="button" className="btn btn-outline" onClick={() => changePane("work")}>Volver al trabajo</button></> : <>
            <nav className={styles.steps} aria-label="Pasos del trabajo académico">{workSteps.map(({ label, icon: Icon }, index) =>
              <button key={label} type="button" aria-current={step === index ? "step" : undefined} disabled={busy || (editorDirty && index !== 2) || (sessionContentDirty && index !== 0)} onClick={() => changeStep(index)}>
                <span aria-hidden="true"><Icon size={14} /></span>{label}
              </button>)}</nav>
            {step === 0 && <div className={styles.objective}>
              {workspace.kind === "course" && <AcademicSyllabusForm key={`syllabus-${workspace.id}`} workspaceId={workspace.id} sessionsVersion={teachingSessionsVersion}
                title={workspace.title} brief={workspace.brief} busy={busy} sessionContentDirty={sessionContentDirty}
                onChange={syllabus => updateWorkspace({ brief: { ...workspace.brief, syllabus } })}
                onBriefChange={(key, value) => updateWorkspace({ brief: { ...workspace.brief, [key]: value } })}
                onCreate={() => void createDraft("course")}
                onHandout={() => void createDraft("participant_handout")}
                onSearch={() => { setDiscoveryQuery(workspace.title.trim()); changePane("discovery"); }} />}
              {programKind && <AcademicTeachingProgram key={`program-${workspace.id}`} kind={programKind}
                workspaceId={workspace.id} sessionsVersion={teachingSessionsVersion} selection={workspace.brief.programSessionIds ?? []}
                congress={workspace.brief.congress} onCongressChange={congress => updateWorkspace({ brief: { ...workspace.brief, congress } })}
                documents={workspace.artifacts.filter(item => item.available && ["proposed", "reviewed"].includes(item.status ?? "")).map(item => ({
                  id: item.id, title: item.title ?? "Documento del trabajo", href: academicHref(workspace.id, item.id),
                }))}
                onConvertAgreement={convertAgreement}
                title={workspace.title} busy={busy} sessionContentDirty={sessionContentDirty}
                onChange={programSessionIds => updateWorkspace({ brief: { ...workspace.brief, programSessionIds } })}
                onCreate={() => void createDraft(programKind)} onHandout={() => void createDraft("participant_handout")} />}
              {workspace.kind === "call" && <AcademicCallForm value={workspace.brief.call} origin={workspace.callOrigin} busy={busy}
                onChange={call => updateWorkspace({ brief: { ...workspace.brief, call } })} />}
              <label>Tu objetivo o texto de trabajo<textarea rows={7} value={workspace.brief.objective} disabled={busy} onChange={event => updateWorkspace({ brief: { ...workspace.brief, objective: event.target.value } })} maxLength={8000} placeholder={ACADEMIC_INSTRUCTIONS[mode]}/></label><details><summary>Opciones del trabajo</summary><div className={styles.brief}><label>Qué quieres preparar<select aria-label="Qué quieres preparar" value={mode} disabled={busy} onChange={event => { setMode(event.target.value as AcademicMode); updateWorkspace({ brief: { ...workspace.brief, task: event.target.value as AcademicMode } }); }}>{ACADEMIC_JOURNEYS.map(item => <optgroup key={item.id} label={item.label}>{item.modes.map(id => <option key={id} value={id}>{ACADEMIC_LABELS[id]}</option>)}</optgroup>)}</select></label>{(["audience", "language", ...(["syllabus", "rubric", "teaching_material"].includes(mode) ? ["duration", "learningOutcomes", "evaluation"] as const : [])] as const).map(key => <label key={key}>{{ audience: "Destinatarios", language: "Idioma", duration: "Duración", learningOutcomes: "Resultados de aprendizaje", evaluation: "Evaluación o actividad" }[key]}<textarea value={workspace.brief[key]} rows={key === "language" || key === "duration" ? 1 : 3} maxLength={key === "language" ? 80 : key === "duration" ? 100 : key === "audience" ? 1000 : 6000} disabled={busy} onChange={event => updateWorkspace({ brief: { ...workspace.brief, [key]: event.target.value } })}/></label>)}</div></details>{mode === "cv" && <button className="btn btn-outline" type="button" disabled={busy || editorDirty || sessionContentDirty} onClick={() => changePane("profile")}>Completar perfil para el currículum</button>}
              {isAcademicTeachingKind(workspace.kind) && <AcademicTeachingSessions key={`agenda-${workspace.id}`} workspaceId={workspace.id}
                deadline={workspace.kind === "call" ? workspace.brief.call?.deadline : undefined} deadlineSaved={!dirty}
                onSessionsChange={() => setTeachingSessionsVersion(version => version + 1)} onContentDirty={setSessionContentDirty} />}
              {workspace.kind !== "course" && <button type="button" className="btn btn-outline" disabled={busy || sessionContentDirty}
                onClick={() => { setTemplate(isAcademicTeachingKind(workspace.kind) ? workspace.kind : "blank"); setShowTemplates(true); changeStep(2); }}><PenLine size={16} aria-hidden="true" /> Abrir editor</button>}<button type="button" className="btn btn-primary" disabled={busy || sessionContentDirty || !workspace.brief.objective.trim()} onClick={() => { void saveWorkspace().then(saved => { if (saved) changeStep(1); }); }}>{dirty ? "Guardar y elegir fuentes" : "Elegir fuentes"}<ArrowRight size={16}/></button></div>}
            {step === 1 && <div className={styles.sourceStep}>
              {workspace.unavailableSources > 0 && <p role="status">
                {workspace.unavailableSources === 1 ? "Un pasaje guardado ya no está disponible." : `${workspace.unavailableSources} pasajes guardados ya no están disponibles.`}
                {" "}Puedes cambiar tu selección de fuentes para el próximo encargo.
              </p>}
              <fieldset disabled={busy}>
                <AltazorSources selected={sources} onChange={value => { setSources(value); setSourcesChanged(true); setDirty(true); }} />
              </fieldset>
              {(sources.length > 0 || workspace.matrix.rows.length > 0) && <button type="button" className={styles.matrixShortcut} disabled={busy} onClick={() => changePane("matrix")}>Comparar lecturas en la matriz</button>}
              <div className={styles.next}>
                <button type="button" className="btn btn-outline" onClick={() => changeStep(0)}><ArrowLeft size={16}/> Objetivo</button>
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => { void saveWorkspace().then(saved => { if (saved) changeStep(2); }); }}>
                  {dirty ? "Guardar fuentes y continuar" : "Continuar al trabajo"}<ArrowRight size={16}/>
                </button>
              </div>
            </div>}
            {step === 2 && <>
              <section className={styles.manuscriptStart} aria-labelledby="academic-manuscript-title">
                <div><h2 id="academic-manuscript-title">Editor de documentos</h2><p>Escribe desde cero o parte de una estructura editable.</p></div>
                <button type="button" className="btn btn-outline" aria-expanded={showTemplates} disabled={busy || editorDirty}
                  onClick={() => setShowTemplates(value => !value)}><PenLine size={16} aria-hidden="true" /> {showTemplates ? "Cerrar plantillas" : "Nuevo borrador"}</button>
                {showTemplates && <form onSubmit={event => { event.preventDefault(); void createDraft(template); }}>
                  <label>Plantilla del documento<select aria-label="Plantilla del documento" value={template} disabled={busy} onChange={event => setTemplate(event.target.value as AcademicManuscriptTemplate)}>
                    {ACADEMIC_MANUSCRIPT_TEMPLATE_IDS.filter(id => id === "participant_handout"
                      ? isAcademicTeachingSessionKind(workspace.kind)
                      : isAcademicTeachingKind(workspace.kind) || !isAcademicTeachingKind(id)).map(id =>
                      <option key={id} value={id}>{ACADEMIC_MANUSCRIPT_TEMPLATES[id].label}</option>)}
                  </select></label>
                  <p>{ACADEMIC_MANUSCRIPT_TEMPLATES[template].description}</p>
                  {workspace.unavailableSources > 0 && <p role="status">Revisa los pasajes que perdieron acceso en Fuentes antes de crear el borrador.</p>}
                  <button type="submit" className="btn btn-primary" disabled={busy || editorDirty || !workspace.title.trim()}>Crear borrador <ArrowRight size={16} aria-hidden="true" /></button>
                </form>}
              </section>
              <div className={styles.prepare}><div><h2>{ACADEMIC_LABELS[mode]}</h2><p>{sources.length ? `${sources.length} ${sources.length === 1 ? "pasaje elegido" : "pasajes elegidos"}` : "Sin pasajes elegidos directamente"} · <button type="button" disabled={editorDirty || busy} onClick={() => changeStep(1)}>Cambiar fuentes</button></p>
                {matrixEvidenceRows > 0 && <p>{matrixEvidenceRows === 1 ? "1 fila incluida de la matriz aporta pasajes." : `${matrixEvidenceRows} filas incluidas de la matriz aportan pasajes.`}</p>}
              </div><p>{workspace.brief.objective || "Vuelve a Objetivo para indicar tu encargo."}</p>
                <button type="button" className="btn btn-primary" disabled={blocked || !workspace.brief.objective.trim() || !overview?.destination.permitted} onClick={() => void prepare()}>{busy ? "Preparando…" : "Preparar propuesta"}</button>{dirty && <p role="status">Guarda tus cambios antes de preparar otra propuesta.</p>}{overview && !overview.destination.permitted && <p>Configura un proveedor de IA en <a href="/configuracion">Configuración</a> para preparar propuestas.</p>}
              </div>
              {workspace.artifacts.length > 0 && <section className={styles.results}><h2>Documentos del trabajo</h2><ul>{workspace.artifacts.map(artifact => <li key={artifact.id}><button type="button" disabled={!artifact.available || busy || Boolean(editorDirty && artifact.id !== selectedId)} aria-current={selectedId === artifact.id ? "true" : undefined} onClick={() => selectArtifact(artifact)}><span>{artifact.available ? artifact.title : "Resultado cuyo respaldo ya no está disponible"}</span><small>{(artifact.template && artifact.status === "proposed" ? "Borrador" : statusLabels[artifact.status || ""]) || "No disponible"}</small></button></li>)}</ul></section>}
              {selected?.available && selected.status === "prepared" && <div className={styles.prepared}><p>Este encargo está guardado y aún no se ha enviado al proveedor.</p><button type="button" className="btn btn-primary" disabled={blocked} onClick={() => void prepare(selected.id)}>Ejecutar encargo guardado</button></div>}
              {selected?.available && ["proposed", "reviewed"].includes(selected.status || "") && <AcademicEditor key={selected.id} workspaceId={workspace.id} artifact={selected} causas={causas} onDirty={setEditorDirty} onSaved={artifact => setWorkspace(current => current ? { ...current, artifacts: current.artifacts.map(item => item.id === artifact.id ? artifact : item) } : current)} onSelectionTask={(text, nextMode) => { if (text.length > 7000) { setError("Elige hasta 7.000 caracteres para preparar una revisión de la selección."); return; } setMode(nextMode); updateWorkspace({ brief: { ...workspace.brief, objective: text, task: nextMode } }); changeStep(0); setNotice("Selección copiada al objetivo. Guarda el encargo y prepara otra propuesta; el original se conserva."); }}/>}
            </>}
          </>}
        </>}
      </>}
    </>}
    {running && workspace && <div className={styles.running} role="status">
      <span>{running.status === "prepared" ? "Encargo conservado, pendiente de ejecución" : "Altazor está preparando tu propuesta"}</span>
      <button type="button" className="btn btn-outline" disabled={stopping} onClick={() => void stopPreparation()}>{stopping ? "Deteniendo…" : "Detener"}</button>
    </div>}
    {profileDirty && <p role="status">Guarda tu perfil antes de cambiar de apartado.</p>}
  </section>;
}
