"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";

/** Dispara pull de Google Calendar → Eventos LexOpen. */
export function GoogleCalendarPullButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function pull() {
    setBusy(true);
    setMessage("");
    const result = await apiMutation<{
      created?: number;
      updated?: number;
      skipped?: number;
      message?: string;
      status?: string;
    }>("/api/integrations/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pull-calendar" }),
    });
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error || "No se pudo sincronizar");
      return;
    }
    const d = result.data;
    if (d.status && d.status !== "ok" && d.status !== "created") {
      setMessage(d.message || `Estado: ${d.status}`);
    } else {
      setMessage(
        `Google → LexOpen: ${d.created ?? 0} nuevos, ${d.updated ?? 0} actualizados` +
          (d.skipped ? `, ${d.skipped} omitidos` : "")
      );
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        className="btn btn-secondary flex-1 sm:flex-none"
        disabled={busy}
        onClick={() => void pull()}
        data-testid="google-calendar-pull"
      >
        {busy ? "Sincronizando…" : "← Google Calendar"}
      </button>
      {message && (
        <p className="max-w-xs text-xs text-[var(--ink-soft)]/70" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
