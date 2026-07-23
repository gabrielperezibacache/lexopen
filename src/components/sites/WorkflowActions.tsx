"use client";

import { useRouter } from "next/navigation";

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

  async function start() {
    await fetch("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", workflowId }),
    });
    router.refresh();
  }

  async function decide(decision: "approve" | "reject") {
    await fetch("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "advance", instanceId, decision }),
    });
    router.refresh();
  }

  if (advance && instanceId) {
    return (
      <div className="flex gap-1">
        <button className="btn btn-ghost" type="button" onClick={() => decide("approve")}>
          Aprobar
        </button>
        <button className="btn btn-ghost" type="button" onClick={() => decide("reject")}>
          Rechazar
        </button>
      </div>
    );
  }

  return (
    <button className="btn btn-secondary" type="button" onClick={start}>
      Iniciar
    </button>
  );
}
