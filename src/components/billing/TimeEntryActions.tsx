"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";

export function TimeEntryActions({ id, approved }: { id: string; approved: boolean }) {
  const router = useRouter();
  const [loadingAction, setLoadingAction] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState("");

  async function setApproval(action: "approve" | "reject") {
    setLoadingAction(action);
    setError("");
    const result = await apiMutation("/api/billing/time-entries", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    setLoadingAction(null);
    if (!result.ok) {
      setError(result.error || "No se pudo actualizar la aprobación");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        className="btn btn-ghost"
        type="button"
        disabled={loadingAction !== null || approved}
        onClick={() => setApproval("approve")}
      >
        {loadingAction === "approve" ? "Procesando…" : "Aprobar"}
      </button>
      <button
        className="btn btn-ghost"
        type="button"
        disabled={loadingAction !== null || !approved}
        onClick={() => setApproval("reject")}
      >
        {loadingAction === "reject" ? "Procesando…" : "Rechazar"}
      </button>
      {error && <p className="w-full text-sm text-[var(--danger)]">{error}</p>}
    </div>
  );
}
