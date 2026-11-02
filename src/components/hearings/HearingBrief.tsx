"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Download, X } from "lucide-react";
import type { HearingBriefInput } from "@/lib/hearings/schemas";
import type { HearingWorkspaceView } from "@/lib/hearings/types";

export function HearingBrief({ workspace, busy, download, openNotes }: {
  workspace: HearingWorkspaceView;
  busy: boolean;
  download: (input: HearingBriefInput) => Promise<void>;
  openNotes: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [opening, setOpening] = useState(""), [closing, setClosing] = useState("");
  const notes = workspace.notes.filter(note => note.available);
  const unavailable = selected.some(id => !notes.some(note => note.id === id));
  function move(index: number, offset: number) {
    setSelected(current => {
      const next = [...current], target = index + offset;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }
  return <form className="hearing-brief-form" onSubmit={event => {
    event.preventDefault();
    if (unavailable || !selected.length) return;
    void download({ opening, closing, notes: selected.map(id => {
      const note = notes.find(note => note.id === id)!;
      return { id: note.id, revision: note.revision };
    }) });
  }}>
    <div className="hearing-brief-intro"><h4>Guion de intervención</h4><p>Ordene sus notas para preparar un alegato o continuar un escrito. Cada respaldo se vuelve a cotejar antes de descargar.</p></div>
    <label>Apertura del guion<textarea className="textarea" value={opening} onChange={event => setOpening(event.target.value)} maxLength={8000} rows={4} disabled={busy} placeholder="Qué solicitará y qué necesita explicar al tribunal…" /><span>Texto propio. No se presenta como fuente corroborada.</span></label>
    <fieldset className="hearing-brief-picker" disabled={busy}>
      <legend>Notas para su intervención</legend>
      <p>Elija hasta veinte. El orden de selección será el orden del guion.</p>
      {!notes.length && <p>No hay notas disponibles. <button className="hearing-copy-link" type="button" onClick={openNotes}>Abrir cuaderno de audiencia</button></p>}
      {notes.map(note => <label className="hearing-check" key={note.id}><input type="checkbox" checked={selected.includes(note.id)} disabled={busy || selected.length >= 20 && !selected.includes(note.id)} onChange={event => setSelected(ids => event.target.checked ? [...ids, note.id] : ids.filter(id => id !== note.id))} /><span><strong>{note.title}</strong><small>{note.citation ? "Con pasaje vinculado · se cotejará al descargar" : "Nota personal · sin respaldo de fuente"}</small></span></label>)}
    </fieldset>
    {selected.length > 0 && <div className="hearing-brief-order"><h5>Orden de intervención</h5><ol>{selected.map((id, index) => {
      const note = notes.find(note => note.id === id);
      return <li key={id}><span>{note?.title || "Nota ya no disponible"}</span><div>
        <button type="button" disabled={busy || index === 0} aria-label={`Subir punto ${index + 1}`} onClick={() => move(index, -1)}><ArrowUp size={15} aria-hidden="true" /></button>
        <button type="button" disabled={busy || index === selected.length - 1} aria-label={`Bajar punto ${index + 1}`} onClick={() => move(index, 1)}><ArrowDown size={15} aria-hidden="true" /></button>
        <button type="button" disabled={busy} aria-label={`Retirar punto ${index + 1}`} onClick={() => setSelected(ids => ids.filter(value => value !== id))}><X size={15} aria-hidden="true" /></button>
      </div></li>;
    })}</ol></div>}
    {unavailable && <p className="hearing-warning" role="status">Una nota seleccionada ya no está disponible. Retírela del orden antes de descargar.</p>}
    <label>Petición de cierre<textarea className="textarea" value={closing} onChange={event => setClosing(event.target.value)} maxLength={8000} rows={4} disabled={busy} placeholder="La petición concreta y los puntos que requieren decisión…" /><span>Revise su correspondencia con los antecedentes.</span></label>
    <button type="submit" className="btn btn-primary" disabled={busy || unavailable || !selected.length}><Download size={16} aria-hidden="true" />{busy ? "Corroborando respaldos…" : "Corroborar y descargar guion"}</button>
    <p className="hearing-muted">Se genera un archivo de texto con observaciones y citas numeradas, sin llamar a la IA. Apertura, cierre y orden permanecen en esta pantalla hasta cambiar de mesa o recargar; descargue el guion para conservarlos.</p>
  </form>;
}
