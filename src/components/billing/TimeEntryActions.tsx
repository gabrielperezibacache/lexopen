"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";

export function TimeEntryActions({ id, approved }: { id: string; approved: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function setApproval(action: "approve" | "reject") {
    setBusy(true);
    setError("");
    const result = await apiMutation("/api/billing/time-entries", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    setBusy(false);
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
        disabled={busy || approved}
        onClick={() => setApproval("approve")}
      >
        Aprobar
      </button>
      <button
        className="btn btn-ghost"
        type="button"
        disabled={busy || !approved}
        onClick={() => setApproval("reject")}
      >
        Rechazar
      </button>
      {error && <p className="w-full text-sm text-[var(--danger)]">{error}</p>}
    </div>
  );
}
