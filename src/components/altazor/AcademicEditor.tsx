"use client";
import { useEffect, useRef, useState } from "react";
import { Download, History, Save } from "lucide-react";
import { academicOutline, academicTextStats, tidyAcademicSpacing } from "@/lib/altazor/academic-templates";
import type { AcademicMode } from "@/lib/altazor/academic-schemas";
import { academicApi as api, type AcademicArtifact } from "./academic-ui";
import styles from "./AltazorAcademic.module.css";

type Version = { revision: number; reviewed: boolean; createdAt: string };
type Saved = { body: string; reviewed: boolean; revision: number };
type Props = { workspaceId: string; artifact: AcademicArtifact; causas: { id: string; titulo: string; rit: string | null }[]; onDirty: (dirty: boolean) => void; onSaved: (artifact: AcademicArtifact) => void; onSelectionTask: (text: string, mode: AcademicMode) => void };
export function AcademicEditor({ workspaceId, artifact, causas, onDirty, onSaved, onSelectionTask }: Props) {
  const initial = { body: artifact.body || "", reviewed: artifact.status === "reviewed", revision: artifact.revision! };
  const [savedState, setSavedState] = useState<Saved>(initial);
  const [body, setBody] = useState(initial.body), [reviewed, setReviewed] = useState(initial.reviewed), [saveState, setSaveState] = useState<"saved" | "pending" | "saving" | "error">("saved");
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [selection, setSelection] = useState(""), [busy, setBusy] = useState(false), [targetCase, setTargetCase] = useState(""), [incorporatedHref, setIncorporatedHref] = useState("");
  const [versions, setVersions] = useState<Version[] | null>(null), [nextBefore, setNextBefore] = useState<number | null>(null), [preview, setPreview] = useState<{ revision: number; body: string; reviewed: boolean } | null>(null);
  const saved = useRef<Saved>(initial), draft = useRef({ body, reviewed }), inFlight = useRef(false), mounted = useRef(true), editor = useRef<HTMLTextAreaElement>(null), callback = useRef({ onDirty, onSaved });
  useEffect(() => { callback.current = { onDirty, onSaved }; }, [onDirty, onSaved]);
  useEffect(() => { draft.current = { body, reviewed }; }, [body, reviewed]);
  const dirty = body !== savedState.body || reviewed !== savedState.reviewed, stats = academicTextStats(body), outline = academicOutline(body), base = `/api/altazor/academic/${workspaceId}/artifacts/${artifact.id}`;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { callback.current.onDirty(dirty); }, [dirty]);
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
      setVersions(null); setPreview(null); return true;
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
  async function history(before?: number) {
    setBusy(true); setError("");
    try { const result = await api<{ versions: Version[]; nextBefore: number | null }>(`${base}/history${before ? `?before=${before}` : ""}`); setVersions(previous => before ? [...previous || [], ...result.versions] : result.versions); setNextBefore(result.nextBefore); }
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
  return <section className={styles.editor} aria-label="Editor académico">
    <div className={styles.editorHeading}><h2>{artifact.title}</h2><span role="status">{{ saved: "Guardado", pending: "Cambios pendientes", saving: "Guardando…", error: "No se guardaron los cambios" }[saveState]}</span></div>
    {error && <div className={styles.error} role="alert"><p>{error}</p>{saveState === "error" && <div><button type="button" className="btn btn-outline" disabled={busy} onClick={() => void save()}>Reintentar guardado</button><button type="button" className="btn btn-ghost" onClick={() => { if (navigator.clipboard) void navigator.clipboard.writeText(body).then(() => setNotice("Texto copiado. Puedes conservarlo antes de recargar.")).catch(() => setNotice("Selecciona el texto en el editor para copiarlo.")); }}>Copiar mi texto</button></div>}</div>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    <div className={styles.editorToolbar}><button type="button" className="btn btn-outline" disabled={busy || saveState === "saving" || !dirty} onClick={() => void save()}><Save size={15}/> Guardar ahora</button><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void history()}><History size={15}/> Historial</button><details><summary>Herramientas de texto</summary><div><button type="button" disabled={busy} onClick={() => edit(tidyAcademicSpacing(body))}>Limpiar espacios finales</button><button type="button" disabled={!selection || busy || dirty} onClick={() => onSelectionTask(selection, "peer_review")}>Revisar selección con ALTAZOR</button><button type="button" disabled={!selection || busy || dirty} onClick={() => onSelectionTask(selection, "translation")}>Traducir selección</button></div><p>Selecciona un pasaje del editor. ALTAZOR preparará otra propuesta para revisar; el texto actual se conserva.</p></details></div>
    <label className={styles.editorLabel}>Texto de trabajo<textarea ref={editor} value={body} rows={22} maxLength={100000} disabled={busy} onChange={event => edit(event.target.value)} onSelect={event => { const el = event.currentTarget; setSelection(el.value.slice(el.selectionStart, el.selectionEnd)); }}/></label>
    <p className={styles.stats}>{stats.words.toLocaleString("es-CL")} palabras · {stats.characters.toLocaleString("es-CL")} caracteres · {stats.readingMinutes} min de lectura</p>
    {outline.length > 0 && <details className={styles.outline}><summary>Esquema del texto</summary><ol>{outline.map((entry, index) => <li key={`${entry.offset}-${index}`}><button type="button" onClick={() => { editor.current?.focus(); editor.current?.setSelectionRange(entry.offset, entry.offset); }}>{entry.title}</button></li>)}</ol></details>}
    <label className="altazor-check"><input type="checkbox" checked={reviewed} disabled={busy} onChange={event => { setReviewed(event.target.checked); setSaveState(current => current === "error" ? "error" : "pending"); }}/> He revisado este contenido y sus fuentes</label>
    <div className={styles.editorToolbar}><a className="btn btn-outline" aria-disabled={dirty || busy} href={`${base}/export?format=docx`} onClick={event => { if (dirty || busy) event.preventDefault(); }}><Download size={16}/> Descargar Word</a><a className="btn btn-ghost" aria-disabled={dirty || busy} href={`${base}/export?format=md`} onClick={event => { if (dirty || busy) event.preventDefault(); }}>Markdown</a></div>
    {dirty && <p className={styles.muted}>El guardado automático conserva tus cambios antes de descargar o incorporar el texto.</p>}
    <details className={styles.destinations}><summary>Incorporar o compartir una revisión</summary><label>Causa de destino<select value={targetCase} onChange={event => { setTargetCase(event.target.value); setIncorporatedHref(""); }}><option value="">Selecciona una causa</option>{causas.map(causa => <option key={causa.id} value={causa.id}>{causa.rit ? `${causa.rit} · ` : ""}{causa.titulo}</option>)}</select></label><div className={styles.editorToolbar}><button type="button" className="btn btn-outline" disabled={busy || dirty || !targetCase || !reviewed || !artifact.sources?.length} onClick={() => void action(async () => { const result = await api<{ draftId: string; causaId: string }>(`${base}/incorporate`, { causaId: targetCase, expectedRevision: saved.current.revision }); setIncorporatedHref(`/causas/${encodeURIComponent(result.causaId)}/escritos?draft=${encodeURIComponent(result.draftId)}`); setNotice("Revisión incorporada como escrito privado con sus referencias."); })}>Incorporar a la causa</button><button type="button" className="btn btn-outline" disabled={busy || dirty || !reviewed} onClick={() => void action(async () => { const result = await api<{ truncated: boolean }>(`${base}/linkedin-draft`, { expectedRevision: saved.current.revision }); setNotice(`Borrador privado conservado en Conexiones.${result.truncated ? " Se copiaron sus primeros 3.000 caracteres." : ""} Revisa allí el texto y la audiencia antes de compartirlo.`); })}>Preparar para LinkedIn</button></div>{incorporatedHref && <a href={incorporatedHref}>Abrir escrito incorporado</a>}<p>Requiere una revisión guardada. Los textos editados no adquieren corroboración automática.</p></details>
    {!!artifact.sources?.length && <section className={styles.proofs}><h3>Fuentes de esta propuesta</h3>{artifact.sources.map((source, index) => <details key={index}><summary>R{index + 1} · {source.title}</summary><blockquote>{source.text}</blockquote><a href={source.href}>Abrir fuente</a>{source.warnings.map(warning => <p key={warning}>{warning}</p>)}</details>)}</section>}
    {versions && <section className={styles.history}><h3>Historial de versiones</h3><p>Recuperar una versión crea otra revisión; las anteriores se conservan.</p><ul>{versions.map(version => <li key={version.revision}><button type="button" disabled={busy} onClick={() => void action(async () => setPreview(await api(`${base}/history?revision=${version.revision}`)))}>Versión {version.revision} · {new Date(version.createdAt).toLocaleString("es-CL")} · {version.reviewed ? "revisada" : "por revisar"}</button></li>)}</ul>{nextBefore && <button type="button" className="btn btn-outline" disabled={busy} onClick={() => void history(nextBefore)}>Versiones anteriores</button>}{preview && <div><h4>Versión {preview.revision}</h4><pre>{preview.body}</pre><button type="button" className="btn btn-outline" disabled={busy || dirty || preview.revision === savedState.revision} onClick={() => void restore()}>Recuperar como nueva revisión</button>{dirty && <p>Guarda el texto actual antes de recuperar otra versión.</p>}</div>}</section>}
  </section>;
}
