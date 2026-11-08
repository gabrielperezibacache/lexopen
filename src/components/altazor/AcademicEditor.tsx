"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Bold, BookOpen, Download, Heading1, Heading2, History, Italic, List, ListOrdered, Quote, Save } from "lucide-react";
import { academicOutline, academicTextStats, tidyAcademicSpacing } from "@/lib/altazor/academic-templates";
import type { AcademicMode } from "@/lib/altazor/academic-schemas";
import { MarkdownView } from "@/lib/markdown";
import { academicApi as api, type AcademicArtifact } from "./academic-ui";
import { formatAcademicSelection, insertAcademicCitation, type AcademicFormat } from "./academic-editor-format";
import styles from "./AltazorAcademic.module.css";

type Version = { revision: number; reviewed: boolean; createdAt?: string };
type Saved = { body: string; reviewed: boolean; revision: number };
type ExportFormat = "docx" | "md" | "references";
type Props = { workspaceId: string; artifact: AcademicArtifact; causas: { id: string; titulo: string; rit: string | null }[]; onDirty: (dirty: boolean) => void; onSaved: (artifact: AcademicArtifact) => void; onSelectionTask: (text: string, mode: AcademicMode) => void };
const textLimit = 100_000;
const formats = [
  { id: "title", label: "Título", Icon: Heading1 },
  { id: "heading", label: "Sección", Icon: Heading2 },
  { id: "bold", label: "Negrita", Icon: Bold, shortcut: "Control+B Meta+B" },
  { id: "italic", label: "Cursiva", Icon: Italic, shortcut: "Control+I Meta+I" },
  { id: "quote", label: "Cita en bloque", Icon: Quote },
  { id: "bullets", label: "Viñetas", Icon: List },
  { id: "numbered", label: "Lista numerada", Icon: ListOrdered },
] as const satisfies readonly { id: AcademicFormat; label: string; Icon: typeof Bold; shortcut?: string }[];
export function AcademicEditor({ workspaceId, artifact, causas, onDirty, onSaved, onSelectionTask }: Props) {
  const historyId = useId();
  const initial = { body: artifact.body || "", reviewed: artifact.status === "reviewed", revision: artifact.revision! };
  const [savedState, setSavedState] = useState<Saved>(initial);
  const [body, setBody] = useState(initial.body), [reviewed, setReviewed] = useState(initial.reviewed), [saveState, setSaveState] = useState<"saved" | "pending" | "saving" | "error">("saved");
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [selection, setSelection] = useState(""), [busy, setBusy] = useState(false), [targetCase, setTargetCase] = useState(""), [incorporatedHref, setIncorporatedHref] = useState("");
  const [versions, setVersions] = useState<Version[] | null>(null), [nextBefore, setNextBefore] = useState<number | null>(null), [preview, setPreview] = useState<Saved | null>(null);
  const [exporting, setExporting] = useState<number | null>(null);
  const [exportFeedback, setExportFeedback] = useState<{ revision: number; message: string; error?: boolean } | null>(null);
  const [view, setView] = useState<"write" | "preview">("write");
  const [citationSource, setCitationSource] = useState(1);
  const saved = useRef<Saved>(initial), draft = useRef({ body, reviewed }), inFlight = useRef(false), mounted = useRef(true), editor = useRef<HTMLTextAreaElement>(null), callback = useRef({ onDirty, onSaved });
  const historyHeading = useRef<HTMLHeadingElement>(null), previewHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { callback.current = { onDirty, onSaved }; }, [onDirty, onSaved]);
  useEffect(() => { draft.current = { body, reviewed }; }, [body, reviewed]);
  const dirty = body !== savedState.body || reviewed !== savedState.reviewed, stats = academicTextStats(body), outline = academicOutline(body), base = `/api/altazor/academic/${workspaceId}/artifacts/${artifact.id}`;
  const hasSources = Boolean(artifact.sources?.length);
  const historyOpen = versions !== null;
  const exportHref = (format: ExportFormat, revision: number) => `${base}/export?format=${format}&revision=${revision}`;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { callback.current.onDirty(dirty); }, [dirty]);
  useEffect(() => {
    if (!historyOpen) return;
    historyHeading.current?.focus({ preventScroll: true });
    historyHeading.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [historyOpen]);
  useEffect(() => {
    if (!preview) return;
    previewHeading.current?.focus({ preventScroll: true });
    previewHeading.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [preview]);
  async function save() {
    if (inFlight.current) return false;
    const submitted = { ...draft.current };
    if (submitted.body === saved.current.body && submitted.reviewed === saved.current.reviewed) return true;
    inFlight.current = true; setSaveState("saving"); setError("");
    try {
      const result = await api<{ revision: number }>(base, { expectedRevision: saved.current.revision, ...submitted }, "PATCH");
      saved.current = { ...submitted, revision: result.revision };
      if (!mounted.current) return true;
      setSavedState(saved.current);
      callback.current.onSaved({ ...artifact, body: submitted.body, status: submitted.reviewed ? "reviewed" : "proposed", revision: result.revision });
      setSaveState(draft.current.body === submitted.body && draft.current.reviewed === submitted.reviewed ? "saved" : "pending");
      setVersions(previous => previous && previous[0]?.revision !== result.revision
        ? [{ revision: result.revision, reviewed: submitted.reviewed }, ...previous.filter(version => version.revision !== result.revision)]
        : previous);
      return true;
    } catch (reason) {
      if (mounted.current) { setError(reason instanceof Error ? reason.message : "No se guardaron los últimos cambios. Conserva este texto e inténtalo nuevamente."); setSaveState("error"); }
      return false;
    } finally { inFlight.current = false; }
  }
  // A failed/conflicting request pauses autosave until the professional retries;
  // local edits stay visible and are never replaced by a late response.
  useEffect(() => {
    if (!dirty || saveState === "error" || inFlight.current || busy) return;
    const timer = window.setTimeout(() => { void save(); }, 1500);
    return () => window.clearTimeout(timer);
  });
  function edit(value: string) { setBody(value); setReviewed(false); setSaveState(current => current === "error" ? "error" : "pending"); setIncorporatedHref(""); }
  function editSelection(command: AcademicFormat | number) {
    const field = editor.current;
    if (!field || busy || view !== "write") return;
    const { value, selectionStart, selectionEnd } = field;
    const change = typeof command === "number"
      ? insertAcademicCitation(value, selectionEnd, command)
      : formatAcademicSelection(value, selectionStart, selectionEnd, command);
    if (value.length - (change.end - change.start) + change.text.length > textLimit) {
      setNotice("El texto admite hasta 100.000 caracteres.");
      return;
    }
    field.setRangeText(change.text, change.start, change.end);
    field.focus({ preventScroll: true });
    field.setSelectionRange(change.selectionStart, change.selectionEnd);
    setSelection(field.value.slice(change.selectionStart, change.selectionEnd));
    if (field.value !== value) edit(field.value);
  }
  function focusEditor(offset?: number) {
    setView("write");
    window.requestAnimationFrame(() => {
      editor.current?.focus();
      if (offset !== undefined) editor.current?.setSelectionRange(offset, offset);
    });
  }
  async function history(before?: number) {
    setBusy(true); setError("");
    try {
      const result = await api<{ versions: Version[]; nextBefore: number | null }>(`${base}/history${before ? `?before=${before}` : ""}`);
      setVersions(previous => before ? [...previous || [], ...result.versions] : result.versions);
      setNextBefore(result.nextBefore);
      if (!before && historyOpen) {
        historyHeading.current?.focus({ preventScroll: true });
        historyHeading.current?.scrollIntoView({ block: "start", behavior: "instant" });
      }
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo abrir el historial."); } finally { setBusy(false); }
  }
  async function restore() {
    if (!preview || dirty || inFlight.current) return; setBusy(true); setError("");
    try {
      const result = await api<Saved>(`${base}/history`, { expectedRevision: saved.current.revision, revision: preview.revision });
      saved.current = result; setSavedState(result); draft.current = { body: result.body, reviewed: false }; setBody(result.body); setReviewed(false); setSaveState("saved"); setVersions(null); setPreview(null); setSelection("");
      callback.current.onSaved({ ...artifact, body: result.body, status: "proposed", revision: result.revision }); setNotice("Versión recuperada como una revisión nueva. Revisa su contenido antes de marcarla como revisada.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo recuperar la versión."); } finally { setBusy(false); }
  }
  async function action(run: () => Promise<void>) { setBusy(true); setError(""); try { await run(); } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo completar la acción."); } finally { setBusy(false); } }
  async function selectVersion(revision: number) {
    if (busy) return;
    setPreview(null);
    setExportFeedback(null);
    await action(async () => {
      const version = await api<Saved>(`${base}/history?revision=${revision}`);
      if (mounted.current) setPreview(version);
    });
  }
  async function downloadVersion(revision: number, format: ExportFormat) {
    if (exporting !== null) return;
    setExporting(revision);
    setExportFeedback(null);
    try {
      const response = await fetch(exportHref(format, revision), { cache: "no-store" });
      const type = format === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "text/markdown";
      if (!response.ok || !response.headers.get("Content-Type")?.startsWith(type)) {
        const value = await response.json().catch(() => null);
        throw new Error(value?.error || "No se pudo descargar esta versión. Comprueba el acceso e inténtalo nuevamente.");
      }
      const bytes = await response.blob();
      if (!mounted.current) return;
      const url = URL.createObjectURL(bytes), link = document.createElement("a");
      const suffix = format === "references" ? "-fuentes.md" : `.${format}`;
      link.href = url;
      link.download = `altazor-${artifact.id}-v${revision}${suffix}`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setExportFeedback({ revision, message: `Descarga iniciada para la versión ${revision}.` });
    } catch (reason) {
      if (mounted.current) setExportFeedback({ revision, error: true, message: reason instanceof Error && !(reason instanceof TypeError) ? reason.message : "No se pudo descargar esta versión. Vuelve a intentarlo." });
    } finally { if (mounted.current) setExporting(null); }
  }
  return <section className={styles.editor} aria-label="Editor académico">
    <div className={styles.editorHeading}>
      <h2>{artifact.title}</h2>
      <div className={styles.editorVersion}>
        <span>Texto actual · versión guardada {savedState.revision}</span>
        <span role="status">{{ saved: "Guardado", pending: "Cambios pendientes", saving: "Guardando…", error: "No se guardaron los cambios" }[saveState]}</span>
      </div>
    </div>
    {error && <div className={styles.error} role="alert"><p>{error}</p>{saveState === "error" && <div><button type="button" className="btn btn-outline" disabled={busy} onClick={() => void save()}>Reintentar guardado</button><button type="button" className="btn btn-ghost" onClick={() => { if (navigator.clipboard) void navigator.clipboard.writeText(body).then(() => setNotice("Texto copiado. Puedes conservarlo antes de recargar.")).catch(() => setNotice("Selecciona el texto en el editor para copiarlo.")); }}>Copiar mi texto</button></div>}</div>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    <div className={styles.editorToolbar}><button type="button" className="btn btn-outline" disabled={busy || saveState === "saving" || !dirty} onClick={() => void save()}><Save size={15}/> Guardar ahora</button><button type="button" className="btn btn-ghost" aria-expanded={historyOpen} aria-controls={historyOpen ? historyId : undefined} disabled={busy || saveState === "saving"} onClick={() => void history()}><History size={15}/> Historial</button><details><summary>Herramientas de texto</summary><div><button type="button" disabled={busy} onClick={() => edit(tidyAcademicSpacing(body))}>Limpiar espacios finales</button><button type="button" disabled={!selection || busy || dirty} onClick={() => onSelectionTask(selection, "peer_review")}>Revisar selección con ALTAZOR</button><button type="button" disabled={!selection || busy || dirty} onClick={() => onSelectionTask(selection, "translation")}>Traducir selección</button></div><p>Selecciona un pasaje del editor. ALTAZOR preparará otra propuesta para revisar; el texto actual se conserva.</p></details></div>
    <div className={styles.editorPaper}>
      <div className={styles.editorModes} role="group" aria-label="Vista del texto">
        <button type="button" aria-pressed={view === "write"} onClick={() => focusEditor()}>Editar texto</button>
        <button type="button" aria-pressed={view === "preview"} onClick={() => setView("preview")}>Vista previa</button>
      </div>
      <div hidden={view !== "write"}>
        <div className={styles.editorFormats} role="group" aria-label="Formato del texto">
          {formats.map(format => <button key={format.id} type="button" disabled={busy} aria-keyshortcuts={"shortcut" in format ? format.shortcut : undefined} onClick={() => editSelection(format.id)}>
            <format.Icon size={16} aria-hidden="true" /> {format.label}
          </button>)}
        </div>
        {hasSources && <details className={styles.editorCite}>
          <summary><BookOpen size={16} aria-hidden="true" /> Citar un pasaje</summary>
          <div>
            <label>Pasaje para citar<select value={citationSource} disabled={busy} onChange={event => setCitationSource(Number(event.target.value))}>
              {artifact.sources?.map((source, index) => <option key={index + 1} value={index + 1}>R{index + 1} · {source.title}</option>)}
            </select></label>
            <button type="button" className="btn btn-outline" disabled={busy || !artifact.sources?.[citationSource - 1]} onClick={() => editSelection(citationSource)}>Insertar cita</button>
          </div>
        </details>}
        <label className={styles.editorLabel}>Texto de trabajo<textarea ref={editor} value={body} rows={22} maxLength={textLimit} disabled={busy} spellCheck
          onChange={event => edit(event.target.value)}
          onSelect={event => { const field = event.currentTarget; setSelection(field.value.slice(field.selectionStart, field.selectionEnd)); }}
          onKeyDown={event => {
            if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.nativeEvent.isComposing) return;
            const key = event.key.toLowerCase();
            if (key !== "b" && key !== "i") return;
            event.preventDefault();
            editSelection(key === "b" ? "bold" : "italic");
          }}
        /></label>
      </div>
      {view === "preview" && <section className={styles.editorPreview} aria-label="Vista previa del texto de trabajo" tabIndex={0}>
        <MarkdownView content={body} variant="academic" />
      </section>}
    </div>
    <p className={styles.stats}>{stats.words.toLocaleString("es-CL")} palabras · {stats.characters.toLocaleString("es-CL")} caracteres · {stats.readingMinutes} min de lectura</p>
    {outline.length > 0 && <details className={styles.outline}><summary>Esquema del texto</summary><ol>{outline.map((entry, index) => <li key={`${entry.offset}-${index}`}><button type="button" onClick={() => focusEditor(entry.offset)}>{entry.title}</button></li>)}</ol></details>}
    <label className="altazor-check"><input type="checkbox" checked={reviewed} disabled={busy} onChange={event => { setReviewed(event.target.checked); setSaveState(current => current === "error" ? "error" : "pending"); }}/> He revisado este contenido y sus fuentes</label>
    <div className={styles.editorToolbar} role="group" aria-label="Descargar el texto actual">
      <a className="btn btn-outline" aria-disabled={dirty || busy} href={exportHref("docx", savedState.revision)} onClick={event => { if (dirty || busy) event.preventDefault(); }}><Download size={16} aria-hidden="true" /> Descargar Word</a>
      <a className="btn btn-ghost" aria-disabled={dirty || busy} href={exportHref("md", savedState.revision)} onClick={event => { if (dirty || busy) event.preventDefault(); }}>Markdown</a>
      {hasSources && <a className="btn btn-ghost" aria-disabled={dirty || busy} href={exportHref("references", savedState.revision)} onClick={event => { if (dirty || busy) event.preventDefault(); }}>Descargar fuentes del texto actual</a>}
    </div>
    {dirty && <p className={styles.muted}>El guardado automático conserva tus cambios antes de descargar o incorporar el texto.</p>}
    <details className={styles.destinations}><summary>Incorporar o compartir una revisión</summary><label>Causa de destino<select value={targetCase} onChange={event => { setTargetCase(event.target.value); setIncorporatedHref(""); }}><option value="">Selecciona una causa</option>{causas.map(causa => <option key={causa.id} value={causa.id}>{causa.rit ? `${causa.rit} · ` : ""}{causa.titulo}</option>)}</select></label><div className={styles.editorToolbar}><button type="button" className="btn btn-outline" disabled={busy || dirty || !targetCase || !reviewed || !artifact.sources?.length} onClick={() => void action(async () => { const result = await api<{ draftId: string; causaId: string }>(`${base}/incorporate`, { causaId: targetCase, expectedRevision: saved.current.revision }); setIncorporatedHref(`/causas/${encodeURIComponent(result.causaId)}/escritos?draft=${encodeURIComponent(result.draftId)}`); setNotice("Revisión incorporada como escrito privado con sus referencias."); })}>Incorporar a la causa</button><button type="button" className="btn btn-outline" disabled={busy || dirty || !reviewed} onClick={() => void action(async () => { const result = await api<{ truncated: boolean }>(`${base}/linkedin-draft`, { expectedRevision: saved.current.revision }); setNotice(`Borrador privado conservado en Conexiones.${result.truncated ? " Se copiaron sus primeros 3.000 caracteres." : ""} Revisa allí el texto y la audiencia antes de compartirlo.`); })}>Preparar para LinkedIn</button></div>{incorporatedHref && <a href={incorporatedHref}>Abrir escrito incorporado</a>}<p>Requiere una revisión guardada. Los textos editados no adquieren corroboración automática.</p></details>
    {!!artifact.sources?.length && <section className={styles.proofs}><h3>Fuentes de esta propuesta</h3>{artifact.sources.map((source, index) => <details key={index}><summary>R{index + 1} · {source.title}</summary><blockquote>{source.text}</blockquote><a href={source.href}>Abrir fuente</a>{source.warnings.map(warning => <p key={warning}>{warning}</p>)}</details>)}</section>}
    {versions && <section id={historyId} className={styles.history} aria-labelledby={`${historyId}-title`}>
      <h3 id={`${historyId}-title`} tabIndex={-1} ref={historyHeading}>Historial de versiones</h3>
      <p>Elige una versión guardada para leerla o descargarla. Recuperar una versión crea otra revisión y conserva las anteriores.</p>
      <div className={styles.historyLayout}>
        <div>
          <ul>{versions.map(version => <li key={version.revision}>
            <button type="button" className={styles.historyVersion} aria-pressed={preview?.revision === version.revision} disabled={busy || saveState === "saving"} onClick={() => void selectVersion(version.revision)}>
              <strong>Versión {version.revision} · {version.reviewed ? "revisada" : "por revisar"}</strong>
              {version.createdAt && <time dateTime={version.createdAt}>{new Date(version.createdAt).toLocaleString("es-CL")}</time>}
              {version.revision === savedState.revision && <small>Guardada actual</small>}
            </button>
          </li>)}</ul>
          {nextBefore && <button type="button" className="btn btn-outline" disabled={busy || saveState === "saving"} onClick={() => void history(nextBefore)}>Versiones anteriores</button>}
        </div>
        {preview && <section className={styles.historyPreview} aria-labelledby={`${historyId}-selected`}>
          <h4 id={`${historyId}-selected`} tabIndex={-1} ref={previewHeading}>Versión seleccionada {preview.revision}</h4>
          <p>Word y Markdown reproducen el texto guardado de esta versión.{hasSources ? " Las fuentes se descargan en un archivo aparte." : ""}</p>
          <div className={styles.historyActions}>
            <button type="button" className="btn btn-outline" disabled={exporting !== null} onClick={() => void downloadVersion(preview.revision, "docx")}><Download size={16} aria-hidden="true" />Descargar versión {preview.revision} en Word</button>
            <button type="button" className="btn btn-ghost" disabled={exporting !== null} onClick={() => void downloadVersion(preview.revision, "md")}>Descargar versión {preview.revision} en Markdown</button>
            {hasSources && <button type="button" className="btn btn-ghost" disabled={exporting !== null} onClick={() => void downloadVersion(preview.revision, "references")}>Descargar fuentes de la versión</button>}
          </div>
          {exporting === preview.revision && <p role="status">Preparando la descarga…</p>}
          {exportFeedback?.revision === preview.revision && <p role={exportFeedback.error ? "alert" : "status"} className={exportFeedback.error ? styles.historyError : undefined}>{exportFeedback.message}</p>}
          <pre tabIndex={0} aria-label={`Texto guardado de la versión ${preview.revision}`}>{preview.body}</pre>
          <button type="button" className="btn btn-outline" disabled={busy || dirty || saveState === "saving" || preview.revision === savedState.revision} onClick={() => void restore()}>Recuperar como nueva revisión</button>
          {dirty && <p>Guarda el texto actual antes de recuperar otra versión.</p>}
        </section>}
      </div>
    </section>}
  </section>;
}
