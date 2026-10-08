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
  const [loadingAction, setLoadingAction] = useState<"approve" | "reject" | "start" | null>(null);
  const [error, setError] = useState("");

  async function start() {
    setLoadingAction("start");
    setError("");
    const result = await apiMutation("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", workflowId }),
    });
    setLoadingAction(null);
    if (!result.ok) {
      setError(result.error || "No se pudo iniciar el flujo");
      return;
    }
    router.refresh();
  }

  async function decide(decision: "approve" | "reject") {
    setLoadingAction(decision);
    setError("");
    const result = await apiMutation("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "advance", instanceId, decision }),
    });
    setLoadingAction(null);
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
            disabled={loadingAction !== null}
            onClick={() => decide("approve")}
          >
            {loadingAction === "approve" ? "Aprobando…" : "Aprobar"}
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            disabled={loadingAction !== null}
            onClick={() => decide("reject")}
          >
            {loadingAction === "reject" ? "Rechazando…" : "Rechazar"}
          </button>
        </div>
        {error && <p className="mt-1 text-sm text-[var(--danger)]">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <button className="btn btn-secondary" type="button" disabled={loadingAction !== null} onClick={start}>
        {loadingAction === "start" ? "Iniciando…" : "Iniciar"}
      </button>
      {error && <p className="mt-1 text-sm text-[var(--danger)]">{error}</p>}
    </div>
  );
}
