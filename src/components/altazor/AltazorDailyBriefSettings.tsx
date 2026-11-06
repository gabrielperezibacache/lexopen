"use client";

import Link from "next/link";
import { useState } from "react";
import { apiMutation } from "@/lib/api-mutation";
import type { DailyBriefState } from "@/lib/altazor/daily-brief";
import { requestAltazorUpdatesRefresh } from "./AltazorUpdates";

export function AltazorDailyBriefSettings({ initial, locale }: { initial: DailyBriefState; locale: "es" | "en" }) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();
  const tr = (es: string, en: string) => locale === "en" ? en : es;

  async function update(action: "enable" | "pause" | "run") {
    setBusy(true);
    setMessage(undefined);
    try {
      const result = await apiMutation<DailyBriefState>("/api/altazor/daily-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!result.ok) {
        setMessage({ text: result.error, error: true });
        return;
      }
      setState(result.data);
      if (action === "run") requestAltazorUpdatesRefresh();
      setMessage({ text: action === "run"
        ? tr("El resumen de hoy está listo en tu conversación.", "Today's brief is ready in your conversation.")
        : result.data.enabled
          ? tr("Resumen diario activado.", "Daily brief enabled.")
          : tr("Resumen diario en pausa.", "Daily brief paused.") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="resumen-altazor" className="panel rounded-[var(--radius-lg)] p-5" aria-labelledby="altazor-brief-settings-title">
      <h2 id="altazor-brief-settings-title" className="text-lg font-semibold">{tr("Resumen diario de Altazor", "Altazor's daily brief")}</h2>
      <p className="mt-2 max-w-prose text-sm text-[var(--muted)]">{tr(
        "Recibe en tu conversación privada un resumen de tus avisos de plazos y del correo judicial ya registrado. El resumen automático requiere que el equipo principal de LexOpen esté en marcha y que tenga habilitadas las tareas automáticas.",
        "Get a brief of your deadline alerts and court mail already on file in your private conversation. The automatic brief requires your LexOpen Host to be running with scheduled work enabled.",
      )}</p>
      {state.enabled && !state.backgroundEnabled && <p className="mt-2 text-sm text-[var(--muted)]">{tr(
        "Los encargos en segundo plano están en pausa en Mi asistente. Puedes preparar el resumen ahora.",
        "Background work is paused in My Assistant. You can still prepare the brief now.",
      )}</p>}
      {state.lastDay && <p className="mt-2 text-sm text-[var(--muted)]">
        {tr("Último resumen", "Latest brief")}{" "}
        <time dateTime={state.lastDay}>{new Intl.DateTimeFormat(locale === "en" ? "en" : "es-CL", { dateStyle: "long", timeZone: "UTC" }).format(new Date(state.lastDay))}</time>
      </p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void update("run")}>
          {tr("Preparar resumen de hoy", "Prepare today's brief")}
        </button>
        <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void update(state.enabled ? "pause" : "enable")}>
          {state.enabled ? tr("Pausar resumen diario", "Pause daily brief") : tr("Activar resumen diario", "Enable daily brief")}
        </button>
        {state.lastDay && <Link className="btn btn-ghost" href="/inicio">{tr("Ir a mi conversación", "Open my conversation")}</Link>}
      </div>
      {message && <p className="mt-3 text-sm" role={message.error ? "alert" : "status"}>{message.text}</p>}
    </section>
  );
}
