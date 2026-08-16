"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";

export function WorkflowActions({
  workflowId,
  instanceId,
  advance,
}: {
  workflowId?: string;
  instanceId?: string;
  advance?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setBusy(true);
    setError("");
    const result = await apiMutation("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", workflowId }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "No se pudo iniciar el flujo");
      return;
    }
    router.refresh();
  }

  async function decide(decision: "approve" | "reject") {
    setBusy(true);
    setError("");
    const result = await apiMutation("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "advance", instanceId, decision }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "No se pudo actualizar el flujo");
      return;
    }
    router.refresh();
  }

  if (advance && instanceId) {
    return (
      <div>
        <div className="flex gap-1">
          <button
            className="btn btn-ghost"
            type="button"
            disabled={busy}
            onClick={() => decide("approve")}
          >
            Aprobar
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            disabled={busy}
            onClick={() => decide("reject")}
          >
            Rechazar
          </button>
        </div>
        {error && <p className="mt-1 text-sm text-[var(--danger)]">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <button className="btn btn-secondary" type="button" disabled={busy} onClick={start}>
        {busy ? "Iniciando…" : "Iniciar"}
      </button>
      {error && <p className="mt-1 text-sm text-[var(--danger)]">{error}</p>}
    </div>
  );
}
