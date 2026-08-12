"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DocumentProcessingAction({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function retry() {
    setBusy(true);
    await fetch(`/api/documentos/${documentId}/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <button
      type="button"
      className="text-[var(--sea)] underline-offset-2 hover:underline"
      disabled={busy}
      onClick={retry}
    >
      {busy ? "Reintentando…" : "Reintentar"}
    </button>
  );
}
