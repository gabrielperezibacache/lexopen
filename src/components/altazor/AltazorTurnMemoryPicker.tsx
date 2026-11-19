"use client";
import { useEffect, useState } from "react";
import type { IcaroMemoryView, IcaroTurnSelection, IcaroView } from "@/lib/altazor/icaros/types";
import { IcaroMemoryChoices } from "./IcaroMemoryChoices";

async function read<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok) throw new Error("No se pudo comprobar la memoria de los Ícaros.");
  return response.json();
}

type Props = { causaId: string | null; selection: IcaroTurnSelection[]; onChange: (value: IcaroTurnSelection[]) => void; disabled: boolean };

export function AltazorTurnMemoryPicker(props: Props) {
  const [open, setOpen] = useState(false);
  const count = props.selection.reduce((sum, row) => sum + row.entries.length, 0);
  return <details className="altazor-composer-help" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Recuerdos para delegar{count ? ` · ${count}` : ""}</summary>
    {open && <ProfilePicker {...props} />}
  </details>;
}

function ProfilePicker({ causaId, selection, onChange, disabled }: Props) {
  const [profiles, setProfiles] = useState<IcaroView[] | null>(null);
  const [active, setActive] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const query = causaId ? `?${new URLSearchParams({ causaId })}` : "";
    void read<{ icaros: IcaroView[] }>(`/api/altazor/icaros${query}`, controller.signal).then(result => {
      if (!controller.signal.aborted) setProfiles(result.icaros.filter(p => p.enabled && p.memoryEnabled));
    }).catch(() => { if (!controller.signal.aborted) setError("No se pudieron consultar los Ícaros."); });
    return () => controller.abort();
  }, [causaId]);
  return <fieldset disabled={disabled} className="altazor-panel-form">
    {error ? <p role="alert">{error}</p> : !profiles ? <p role="status">Consultando Ícaros…</p> : profiles.length ? <>
      <label>Ícaro<select className="input" value={active} onChange={event => setActive(event.target.value)}>
        <option value="">Seleccionar un perfil</option>
        {profiles.map(profile => <option key={profile.id} value={profile.id}
          disabled={selection.length >= 2 && !selection.some(s => s.icaroId === profile.id)}>
          {profile.name}{selection.some(s => s.icaroId === profile.id) ? " · recuerdos elegidos" : ""}
        </option>)}
      </select></label>
      {active && <ProfileMemory key={active} id={active} selection={selection} onChange={onChange} disabled={disabled} />}
    </> : <p>Este ámbito no tiene Ícaros con memoria habilitada.</p>}
    {selection.length > 0 && <button type="button" className="btn btn-ghost" onClick={() => onChange([])}>Quitar los recuerdos elegidos</button>}
  </fieldset>;
}

function ProfileMemory({ id, selection, onChange, disabled }: Omit<Props, "causaId"> & { id: string }) {
  const [memory, setMemory] = useState<IcaroMemoryView[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void read<{ memory: IcaroMemoryView[] }>(`/api/altazor/icaros/${encodeURIComponent(id)}/memory`, controller.signal)
      .then(data => { if (!controller.signal.aborted) setMemory(data.memory); })
      .catch(() => { if (!controller.signal.aborted) setError("No se pudieron consultar los recuerdos del perfil."); });
    return () => controller.abort();
  }, [id]);
  if (error) return <p role="alert">{error}</p>;
  if (!memory) return <p role="status">Consultando recuerdos…</p>;
  return <IcaroMemoryChoices memory={memory} selection={selection.find(s => s.icaroId === id)?.entries ?? []}
    disabled={disabled} onChange={entries => {
      const others = selection.filter(s => s.icaroId !== id);
      onChange(entries.length ? [...others, { icaroId: id, entries }] : others);
    }} />;
}
