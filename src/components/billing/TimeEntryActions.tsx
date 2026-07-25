"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function TimeEntryActions({ id, approved }: { id: string; approved: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function setApproval(action: "approve" | "reject") {
    setBusy(true);
    await fetch("/api/billing/time-entries", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    setBusy(false);
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
    </div>
  );
}
