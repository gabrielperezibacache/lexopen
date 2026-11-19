"use client";

import { ICARO_LIMITS, type IcaroMemoryRef, type IcaroMemoryView } from "@/lib/altazor/icaros/types";

type Props = {
  memory: IcaroMemoryView[];
  selection: IcaroMemoryRef[];
  onChange: (selection: IcaroMemoryRef[]) => void;
  disabled?: boolean;
};

export function IcaroMemoryChoices({ memory, selection, onChange, disabled }: Props) {
  const available = memory.filter(item => item.available);
  const selected = available.filter(item => selection.some(ref => ref.id === item.id && ref.revision === item.revision && ref.hash === item.hash));
  const characters = selected.reduce((total, item) => total + item.label.length + item.body.length, 0);
  return <fieldset disabled={disabled} className="space-y-1">
    <legend>Recuerdos para este encargo · {selection.length}/{ICARO_LIMITS.memoryEntriesInContext}</legend>
    {available.length === 0 && <p className="altazor-panel-note">Este Ícaro aún no tiene recuerdos disponibles.</p>}
    {selected.length !== selection.length && <p role="alert">La selección cambió. <button type="button" className="btn btn-ghost" onClick={() => onChange([])}>Limpiar selección</button></p>}
    {available.map(item => {
      const checked = selected.some(ref => ref.id === item.id);
      const overLimit = selection.length >= ICARO_LIMITS.memoryEntriesInContext || characters + item.label.length + item.body.length > ICARO_LIMITS.memoryCharacters;
      return <label className="altazor-check" key={item.id}>
        <input type="checkbox" checked={checked} disabled={!checked && overLimit} onChange={() => {
          const others = selection.filter(ref => ref.id !== item.id);
          onChange(checked ? others : [...others, { id: item.id, revision: item.revision, hash: item.hash }]);
        }} />
        {item.label}
      </label>;
    })}
    {available.length > 0 && <span className="altazor-panel-note">{characters.toLocaleString("es-CL")} de 6.000 caracteres seleccionados</span>}
  </fieldset>;
}
