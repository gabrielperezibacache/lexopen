"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";
import type { HostNavigationSection } from "@/lib/navigation/host-sections";
import { HostSectionChoices } from "./HostSectionChoices";

export function HostSectionSettings({ initial, locale }: { initial: HostNavigationSection[]; locale: "es" | "en" }) {
  const [visible, setVisible] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const router = useRouter();
  const tr = (es: string, en: string) => locale === "en" ? en : es;
  const changed = visible.join(",") !== saved.join(",");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!changed || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    const response = await apiMutation<{ visibleSections: HostNavigationSection[] }>("/api/configuracion/secciones", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibleSections: visible }),
    });
    setBusy(false);
    if (!response.ok) { setError(response.error); return; }
    setSaved(response.data.visibleSections);
    setVisible(response.data.visibleSections);
    setNotice(tr("Menú del equipo actualizado.", "Team menu updated."));
    router.refresh();
  }

  return <form id="apartados-visibles" className="panel space-y-4 p-5" onSubmit={save}>
    <h3 className="text-lg font-semibold">{tr("Apartados visibles", "Visible sections")}</h3>
    <p className="max-w-prose text-sm text-[var(--ink-soft)]">
      {tr("Elige qué apartados aparecen en el menú del equipo. Inicio y Configuración siempre estarán disponibles. Puedes volver a mostrar cualquier apartado y seguir trabajando con sus datos.", "Choose which sections appear in the team menu. Home and Settings are always available. Show a section again to continue working with its data.")}
    </p>
    <HostSectionChoices visible={visible} locale={locale} disabled={busy} onChange={value => { setVisible(value); setError(""); setNotice(""); }} />
    <button type="submit" className="btn btn-primary" disabled={!changed || busy}>
      {busy ? tr("Guardando…", "Saving…") : tr("Guardar apartados", "Save sections")}
    </button>
    {error && <p className="text-sm text-[var(--danger)]" role="alert">{error}</p>}
    {notice && <p className="text-sm text-[var(--sea)]" role="status">{notice}</p>}
  </form>;
}
