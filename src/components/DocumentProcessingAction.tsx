"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";

export function DocumentProcessingAction({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  async function retry() {
    if (busy) return;
    setBusy(true); setError(""); setStatus("");
    try {
      const result = await apiMutation(`/api/documentos/${documentId}/process`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!result.ok) { setError(result.error || "No se pudo preparar el texto. El archivo original se conserva."); return; }
      setStatus("Preparación solicitada."); router.refresh();
    } catch { setError("No se pudo confirmar la preparación. Revisa tu conexión y vuelve a intentarlo."); }
    finally { setBusy(false); }
  }

  return (
    <span><button
      type="button"
      className="text-[var(--sea)] underline-offset-2 hover:underline"
      disabled={busy}
      onClick={retry}
    >
      {busy ? "Preparando…" : "Reintentar"}
    </button>{error && <span className="mt-1 block text-[var(--danger)]" role="alert">{error}</span>}{status && <span className="mt-1 block text-[var(--ink-soft)]" role="status">{status}</span>}</span>
  );
}
