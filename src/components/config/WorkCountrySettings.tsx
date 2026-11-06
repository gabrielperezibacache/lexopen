"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";
import type { WorkCountry } from "@/lib/config/countries";

export function WorkCountrySettings({ initial, locale, options }: {
  initial: WorkCountry | null;
  locale: "es" | "en";
  options: { code: WorkCountry; label: string }[];
}) {
  const [country, setCountry] = useState<WorkCountry | "">(initial || "");
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const router = useRouter();
  const tr = (es: string, en: string) => locale === "en" ? en : es;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const response = await apiMutation<{ country: WorkCountry | null }>("/api/configuracion/pais", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country: country || null }),
    });
    setBusy(false);
    if (!response.ok) { setError(response.error); return; }
    setSaved(response.data.country);
    setNotice(tr("País de trabajo guardado.", "Work country saved."));
    router.refresh();
  }

  return <form id="work-country" className="panel space-y-4 p-5" onSubmit={save}>
    <h3 className="text-lg font-semibold">{tr("País de trabajo", "Work country")}</h3>
    <p className="max-w-prose text-sm text-[var(--ink-soft)]">
      {tr("Seleccionar Chile habilita Comunicaciones. La conexión al Poder Judicial se activa por separado en Gestión de causas.", "Selecting Chile makes Communications available. Connect to the Chilean judiciary separately under Matter management.")}
    </p>
    <label className="grid max-w-sm gap-2 text-sm font-medium">
      <span>{tr("País", "Country")}</span>
      <select className="input w-full" disabled={busy} value={country} onChange={event => { setCountry(event.target.value as WorkCountry | ""); setNotice(""); }}>
        <option value="">{tr("Sin seleccionar", "Not selected")}</option>
        {options.map(({ code, label }) => <option key={code} value={code}>{label}</option>)}
      </select>
    </label>
    <button className="btn btn-primary" type="submit" disabled={busy || (country || null) === saved}>{tr("Guardar país", "Save country")}</button>
    {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
    {notice && <p role="status" className="text-sm text-[var(--sea)]">{notice}</p>}
  </form>;
}
