"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function DocumentDriveAction({
  documentId,
  googleDriveId,
  disabled,
}: {
  documentId: string;
  googleDriveId?: string | null;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  function push() {
    setMsg("");
    setError("");
    startTransition(async () => {
      try {
        const res = await fetch("/api/integrations/google", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "push-documento", documentoId: documentId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || data.message || "No se pudo subir a Drive");
          return;
        }
        setMsg(
          data.message ||
            (data.status === "uploaded"
              ? "Subido a Drive"
              : data.status === "stub"
                ? "Modo stub: conecte Google OAuth"
                : data.status === "needs_real_folder"
                  ? "Vincule una carpeta real en la causa"
                  : String(data.status))
        );
        router.refresh();
      } catch {
        setError("Error de red");
      }
    });
  }

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <button
        type="button"
        className="text-xs text-[var(--sea)] underline disabled:opacity-50"
        disabled={pending || disabled}
        onClick={push}
      >
        {pending ? "Subiendo…" : googleDriveId ? "Re-subir a Drive" : "Subir a Drive"}
      </button>
      {msg && <span className="text-[10px] text-[var(--sea)]">{msg}</span>}
      {error && <span className="text-[10px] text-red-700">{error}</span>}
    </span>
  );
}
