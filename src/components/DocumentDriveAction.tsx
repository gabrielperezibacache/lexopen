"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function DocumentDriveAction({
  documentId,
  googleDriveId,
  disabled,
  hasText = true,
}: {
  documentId: string;
  googleDriveId?: string | null;
  disabled?: boolean;
  /** False when there is no contenido/extractedMarkdown yet. */
  hasText?: boolean;
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
              ? "Subido texto/MD a Drive"
              : data.status === "stub"
                ? "Modo stub: conecte Google OAuth"
                : data.status === "needs_real_folder"
                  ? "Vincule una carpeta real en la causa"
                  : data.status === "needs_ocr"
                    ? "Requiere OCR/extracción primero"
                    : data.status === "unsupported"
                      ? "Sin texto indexado para subir"
                      : String(data.status))
        );
        if (data.status === "uploaded") router.refresh();
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
        disabled={pending || disabled || !hasText}
        title={
          hasText
            ? "Sube texto o Markdown extraído a la carpeta Drive de la causa"
            : "Sin texto indexado (OCR/extracción pendiente)"
        }
        onClick={push}
      >
        {pending
          ? "Subiendo…"
          : googleDriveId
            ? "Re-subir MD a Drive"
            : "Subir MD a Drive"}
      </button>
      {msg && <span className="text-[10px] text-[var(--sea)]">{msg}</span>}
      {error && <span className="text-[10px] text-red-700">{error}</span>}
    </span>
  );
}
