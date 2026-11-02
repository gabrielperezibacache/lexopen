"use client";

import { useId } from "react";
import type { JudicialMetadata } from "@/lib/books/judicial";

export const emptyJudicialMetadata: JudicialMetadata = { court: "", chamber: "", caseNumber: "", rit: "", ruc: "", decisionDate: "", caseTitle: "", matter: "", jurisdiction: "CL", officialUrl: "" };

/** One judicial file has one descriptive record; the content remains the citation source. */
export function JudicialFields({ value, onChange, disabled = false }: { value: JudicialMetadata; onChange: (value: JudicialMetadata) => void; disabled?: boolean }) {
  const id = useId();
  const fields: { name: keyof JudicialMetadata; label: string; max: number; required?: boolean; type?: string }[] = [
    { name: "court", label: "Tribunal", max: 240, required: true },
    { name: "chamber", label: "Sala", max: 160 },
    { name: "caseNumber", label: "Rol o número de causa", max: 120, required: true },
    { name: "decisionDate", label: "Fecha de la resolución", max: 10, required: true, type: "date" },
    { name: "caseTitle", label: "Carátula", max: 300 },
    { name: "matter", label: "Materia", max: 160 },
    { name: "rit", label: "RIT", max: 120 }, { name: "ruc", label: "RUC", max: 120 },
    { name: "jurisdiction", label: "Jurisdicción", max: 80, required: true },
    { name: "officialUrl", label: "Enlace oficial de procedencia (opcional)", max: 2000, type: "url" },
  ];
  return <fieldset className="book-judicial-fields" disabled={disabled}><legend>Ficha de la resolución</legend><div className="book-form-grid">{fields.map(field => <div className="book-field" key={field.name}><label htmlFor={`${id}-${field.name}`}>{field.label}</label><input className="input" id={`${id}-${field.name}`} name={`judicial-${field.name}`} type={field.type || "text"} value={value[field.name]} maxLength={field.max} required={field.required} onChange={event => onChange({ ...value, [field.name]: event.target.value })} /></div>)}</div><p className="book-small">La ficha la completas tú. Las citas se cotejan con el archivo conservado; el enlace de procedencia no certifica por sí solo su autenticidad, firmeza o vigencia.</p></fieldset>;
}
