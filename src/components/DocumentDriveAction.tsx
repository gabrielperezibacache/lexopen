"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { driveFileUrl, isRealDriveFolderId } from "@/lib/integrations/drive-folder";
import { apiMutation } from "@/lib/api-mutation";

export function DocumentDriveAction({
  documentId,
  googleDriveId,
  disabled,
  hasText = true,
  hasBinary = false,
}: {
  documentId: string;
  googleDriveId?: string | null;
  disabled?: boolean;
  /** True when there is contenido/extractedMarkdown. */
  hasText?: boolean;
  /** True when original bytes exist in storage (PDF/DOCX/etc.). */
  hasBinary?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const canUpload = hasText || hasBinary;
  const openUrl =
    googleDriveId && isRealDriveFolderId(googleDriveId)
      ? driveFileUrl(googleDriveId)
      : null;

  function push() {
    setMsg("");
    setError("");
    startTransition(async () => {
      const result = await apiMutation<{
        message?: string;
        status?: string;
        kind?: string;
      }>("/api/integrations/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "push-documento", documentoId: documentId }),
      });
      if (!result.ok) {
        setError(result.error || "No se pudo subir a Drive");
        return;
      }
      const data = result.data;
      setMsg(
        data.message ||
          (data.status === "uploaded"
            ? data.kind === "binary"
              ? "Archivo subido a Drive"
              : "Subido a Drive como Google Doc"
            : data.status === "stub"
              ? "Modo stub: conecte Google OAuth"
              : data.status === "needs_reconnect"
                ? "Reconecte Google OAuth"
                : data.status === "blocked"
                  ? "Drive deshabilitado en Configuración"
                  : data.status === "needs_real_folder"
                    ? "Vincule una carpeta real en la causa"
                    : data.status === "needs_ocr"
                      ? "Requiere OCR/extracción primero"
                      : data.status === "unsupported"
                        ? "Sin contenido para subir"
                        : String(data.status))
      );
      if (data.status === "uploaded") router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className="inline-flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="text-xs text-[var(--sea)] underline disabled:opacity-50"
          disabled={pending || disabled || !canUpload}
          title={
            canUpload
              ? hasBinary && !hasText
                ? "Sube el archivo original a la carpeta Drive de la causa"
                : "Sube archivo original o Markdown a la carpeta Drive de la causa"
              : "Sin archivo ni texto indexado (OCR/extracción pendiente)"
          }
          onClick={push}
        >
          {pending
            ? "Subiendo…"
            : googleDriveId
              ? "Re-subir a Drive"
              : "Subir a Drive"}
        </button>
        {openUrl && (
          <a
            href={openUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-[var(--sea)] underline"
          >
            Abrir en Drive
          </a>
        )}
      </span>
      {msg && <span className="text-[10px] text-[var(--sea)]">{msg}</span>}
      {error && <span className="text-[10px] text-red-700">{error}</span>}
    </span>
  );
}
