"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { driveFileUrl, isRealDriveFolderId } from "@/lib/integrations/drive-folder";
import { apiMutation } from "@/lib/api-mutation";

export function DocumentDriveAction({
  documentId,
  googleDriveId,
  studyFolderId,
  disabled,
  hasText = true,
  hasBinary = false,
}: {
  documentId: string;
  googleDriveId?: string | null;
  studyFolderId?: string;
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
        body: JSON.stringify({ action: "push-documento", documentoId: documentId, ...(studyFolderId ? { studyFolderId } : {}) }),
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
              ? "Conecte Google para guardar esta copia"
              : data.status === "needs_reconnect"
                ? "Vuelva a conectar Google"
                : data.status === "blocked"
                  ? "Drive deshabilitado en Configuración"
                  : data.status === "needs_real_folder"
                    ? "Vincule una carpeta real en la causa"
                    : data.status === "needs_ocr"
                      ? "Primero hay que leer el texto de este documento"
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
          className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--sea)] underline-offset-4 hover:underline disabled:opacity-50"
          disabled={pending || disabled || !canUpload}
          title={
            canUpload
              ? hasBinary && !hasText
                ? "Guarda el archivo original con la cuenta de Google del estudio"
                : "Guarda el archivo original o el texto con la cuenta de Google del estudio"
              : "El texto del documento todavía se está preparando"
          }
          onClick={push}
        >
          {pending
            ? "Subiendo…"
            : googleDriveId
              ? "Guardar otra copia en el Drive del estudio"
              : "Guardar en el Drive del estudio"}
        </button>
        {openUrl && (
          <a
            href={openUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--sea)] underline-offset-4 hover:underline"
          >
            Abrir en Drive
          </a>
        )}
      </span>
      {msg && <span className="text-xs text-[var(--sea)]" role="status">{msg}</span>}
      {error && <span className="text-xs text-[var(--danger)]" role="alert">{error}</span>}
    </span>
  );
}
