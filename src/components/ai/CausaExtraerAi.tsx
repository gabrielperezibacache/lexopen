"use client";

import { useState } from "react";
import { AiAssist, type AiActionResponse } from "@/components/ai/AiAssist";
import { useI18n } from "@/components/i18n/I18nProvider";

function setFormValue(form: HTMLFormElement, name: string, value: string) {
  const el = form.elements.namedItem(name);
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  ) {
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

type Extracted = {
  titulo?: string;
  rit?: string | null;
  ruc?: string | null;
  tribunal?: string;
  materia?: string;
  caratula?: string;
  resumen?: string;
  partes?: Array<{ nombre?: string; rut?: string | null; rol?: string }>;
};

export function CausaExtraerAi({ formId }: { formId: string }) {
  const { t } = useI18n();
  const [note, setNote] = useState("");
  const [text, setText] = useState("");

  function applyExtract(result: AiActionResponse) {
    const data = result.data as Extracted | null;
    if (!data?.titulo && !data?.rit && !data?.tribunal) {
      setNote(t("ai.extraer.noData"));
      return;
    }
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    if (data.titulo) setFormValue(form, "titulo", data.titulo);
    if (data.rit) setFormValue(form, "rit", data.rit);
    if (data.ruc) setFormValue(form, "ruc", data.ruc);
    if (data.tribunal) setFormValue(form, "tribunal", data.tribunal);
    if (data.materia) setFormValue(form, "materia", data.materia);
    if (data.caratula) setFormValue(form, "caratula", data.caratula);
    if (data.resumen) setFormValue(form, "resumen", data.resumen);
    for (const parte of data.partes || []) {
      if (!parte.nombre) continue;
      if (parte.rol === "demandado") {
        setFormValue(form, "demandado", parte.nombre);
        if (parte.rut) setFormValue(form, "demandadoRut", parte.rut);
      } else {
        setFormValue(form, "demandante", parte.nombre);
        if (parte.rut) setFormValue(form, "demandanteRut", parte.rut);
      }
    }
    setNote(t("ai.extraer.applied"));
  }

  return (
    <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white/50 p-4">
      <h3 className="text-sm font-semibold">{t("ai.extraer.title")}</h3>
      <p className="mt-1 text-xs text-[var(--ink-soft)]/70">{t("ai.extraer.hint")}</p>
      <textarea
        className="textarea mt-3 min-h-[100px]"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t("ai.extraer.placeholder")}
      />
      <AiAssist
        action="causa.extraer"
        label={t("ai.extraer.apply")}
        prompt={text}
        showNotes={false}
        showPreview={false}
        onResult={(r) => applyExtract(r)}
      />
      {note && (
        <p className="mt-2 text-xs text-[var(--copper)]" role="status">
          {note}
        </p>
      )}
    </div>
  );
}
