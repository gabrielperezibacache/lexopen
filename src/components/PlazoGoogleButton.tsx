"use client";

import { useState } from "react";

export function PlazoGoogleButton({ plazoId }: { plazoId: string }) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function push() {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/integrations/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "push-plazo", plazoId }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.status === "created") setMsg("Creado en Calendar");
    else if (data.status === "stub") setMsg(data.message);
    else setMsg(data.error || "Error");
  }

  return (
    <div className="text-right">
      <button className="btn btn-ghost" type="button" disabled={busy} onClick={push}>
        {busy ? "…" : "→ Google Calendar"}
      </button>
      {msg && <div className="mt-1 max-w-[220px] text-xs text-[var(--ink-soft)]/70">{msg}</div>}
    </div>
  );
}
