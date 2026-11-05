"use client";
import { useState } from "react";
import { Save } from "lucide-react";
import { academicApi, type AcademicOverview, type AcademicProfile as Profile } from "./academic-ui";
const labels: Record<keyof Profile, string> = { name: "Nombre", headline: "Presentación profesional", orcid: "ORCID", biography: "Biografía", education: "Formación", experience: "Experiencia y docencia", publications: "Publicaciones propias", languages: "Idiomas", interests: "Líneas de investigación" };
export function AcademicProfile({ overview, onSave, onDirty }: { overview: AcademicOverview; onSave: (profile: Profile, revision: number) => void; onDirty: (dirty: boolean) => void }) {
  const [profile, setProfile] = useState(overview.profile), [busy, setBusy] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState(false);
  async function save() {
    setBusy(true); setError("");
    try { const result = await academicApi<{ revision: number }>("/api/altazor/academic/profile", { expectedRevision: overview.profileRevision, profile }, "PUT"); onSave(profile, result.revision); onDirty(false); setSaved(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar el perfil. Conserva los cambios e inténtalo nuevamente."); }
    finally { setBusy(false); }
  }
  return <section className="altazor-profile"><h2>Mi perfil académico</h2><p>Antecedentes privados para preparar tu currículum. Sólo compartes con LinkedIn lo que revisas y eliges expresamente.</p>
    {error && <p role="alert" className="altazor-error">{error}</p>}{saved && <p role="status">Perfil guardado.</p>}
    <fieldset disabled={busy} style={{ border: 0, padding: 0, minWidth: 0 }}><legend className="sr-only">Antecedentes académicos</legend>
      {(Object.keys(labels) as (keyof Profile)[]).map(key => <label key={key}>{labels[key]}{["name", "headline", "orcid", "languages"].includes(key) ? <input value={profile[key]} maxLength={key === "orcid" ? 19 : key === "name" ? 180 : key === "headline" ? 300 : 1000} onChange={event => { setProfile({ ...profile, [key]: event.target.value }); onDirty(true); setSaved(false); }}/>
        : <textarea rows={4} value={profile[key]} maxLength={key === "publications" ? 20000 : key === "interests" ? 2000 : 12000} onChange={event => { setProfile({ ...profile, [key]: event.target.value }); onDirty(true); setSaved(false); }}/>}</label>)}
      <button type="button" className="btn btn-primary" onClick={() => void save()}><Save size={16}/> {busy ? "Guardando…" : "Guardar perfil"}</button>
    </fieldset>
  </section>;
}
