"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { withCsrfHeaders } from "@/lib/client-csrf";
import type { CaseManagementMode } from "@/lib/causas/management-mode";
import styles from "./CaseManagementSettings.module.css";

export function CaseManagementSettings({ initialMode }: { initialMode: CaseManagementMode }) {
  const router = useRouter(), [mode, setMode] = useState(initialMode), [saved, setSaved] = useState(initialMode), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  async function save() {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/configuracion/causas", { method: "PATCH", headers: withCsrfHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ mode }) }), result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo guardar. Vuelve a intentarlo.");
      setSaved(result.mode); setNotice("Modalidad guardada."); router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar la modalidad."); } finally { setBusy(false); }
  }
  return <section id="case-management-settings" className={`panel ${styles.panel}`}>
    <h2>Gestión de causas</h2>
    <fieldset className={styles.options} disabled={busy} aria-describedby="case-management-description">
      <legend className="sr-only">Modalidad de gestión de causas</legend>
      <label><input type="radio" name="case-management-mode" value="manual" checked={mode === "manual"} onChange={() => setMode("manual")} /><span><strong>Gestión manual</strong><small>Organiza expedientes de cualquier país.</small></span></label>
      <label><input type="radio" name="case-management-mode" value="pjud_cl" checked={mode === "pjud_cl"} onChange={() => setMode("pjud_cl")} /><span><strong>Poder Judicial de Chile</strong><small>Consulta OJV, ClaveÚnica y seguimiento automático.</small></span></label>
    </fieldset>
    <p id="case-management-description">Cambiar la modalidad conserva tus causas, documentos y conexiones. En gestión manual se pausa la actualización judicial.</p>
    <button type="button" className="btn btn-primary" disabled={busy || mode === saved} onClick={() => void save()}>{busy ? "Guardando…" : "Guardar modalidad"}</button>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
  </section>;
}
