"use client";

import Link from "next/link";
import { useAltazorCompanion } from "@/components/altazor/AltazorCompanionProvider";

export function AltazorPreferencesPanel({ locale }: { locale: "es" | "en" }) {
  const { loading, preference, preferenceSaving, preferenceError, savePreference } = useAltazorCompanion();
  const tr = (es: string, en: string) => locale === "en" ? en : es;
  return <section id="preferencias-altazor" className="panel space-y-4 p-5">
    <h3 className="text-lg font-semibold">{tr("Altazor", "Altazor")}</h3>
    <label className="flex items-start gap-3">
      <input className="mt-1" type="checkbox" disabled={loading || preferenceSaving} checked={preference.memoryEnabled} onChange={event => void savePreference({ memoryEnabled: event.target.checked })} />
      {tr("Usar recuerdos guardados", "Use saved memories")}
    </label>
    <label className="flex items-start gap-3">
      <input className="mt-1" type="checkbox" disabled={loading || preferenceSaving} checked={preference.backgroundEnabled} onChange={event => void savePreference({ backgroundEnabled: event.target.checked })} />
      {tr("Continuar los encargos en segundo plano", "Continue work in the background")}
    </label>
    {preferenceError && <p role="alert" className="text-sm text-[var(--danger)]">{preferenceError}</p>}
    <div className="flex flex-wrap gap-2">
      <a className="btn btn-secondary" href="#cuentas-conectadas">{tr("Cuentas conectadas", "Connected accounts")}</a>
      <Link className="btn btn-ghost" href="/cuenta#resumen-altazor">{tr("Resumen diario", "Daily brief")}</Link>
      <Link className="btn btn-ghost" href="/cuenta#codex">{tr("Cuenta de Codex", "Codex account")}</Link>
    </div>
  </section>;
}
