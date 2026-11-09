"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { driveFileUrl, isRealDriveFolderId } from "@/lib/integrations/drive-folder";
import { apiMutation } from "@/lib/api-mutation";

type DrivePreview = {
  causaId: string | null; caseRevision: string; connected: boolean; canManage: boolean; connectionId: string | null; bindingRevision: string | null; reason: string | null; canConfigure: boolean;
  folder: { id: string; name: string; url: string } | null;
  pendingOperation?: { requestId: string; state: string; documentoId?: string | null } | null;
  document?: { id: string; name: string; version: number; sourceSha256: string; bytes: number; mime: string; remoteId?: string | null; remoteVersion?: string | null; remoteTargetState?: "none" | "ready" | "unavailable" | "outside_folder"; canSave?: boolean; reason?: string | null } | null;
};
type DriveResult = { state: "completed" | "pending" | "unknown" | "failed"; message: string; file?: { id: string; name: string; url?: string } };
type PendingDriveSave = { requestId: string; causaId: string; connectionId: string; bindingRevision: string; documentoId?: string | null };

export function DocumentDriveAction(props: Parameters<typeof LegacyDocumentDriveAction>[0]) {
  const router = useRouter();
  const [preview, setPreview] = useState<DrivePreview | null>(null), [busy, setBusy] = useState(false), [pendingSave, setPendingSave] = useState<PendingDriveSave | null>(null), [message, setMessage] = useState(""), [error, setError] = useState(""), [savedUrl, setSavedUrl] = useState<string | null>(null);
  const canUpload = props.hasBinary || props.hasText !== false;
  async function prepare() {
    if (busy || pendingSave) return;
    setBusy(true); setMessage(""); setError(""); setPreview(null);
    const result = await apiMutation<DrivePreview>(`/api/documentos/${encodeURIComponent(props.documentId)}/drive`, { method: "GET", cache: "no-store" });
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    const value = result.data; setPreview(value);
    if (value.pendingOperation && value.causaId && value.connectionId && value.bindingRevision) setPendingSave({ requestId: value.pendingOperation.requestId, causaId: value.causaId, connectionId: value.connectionId, bindingRevision: value.bindingRevision, documentoId: value.pendingOperation.documentoId });
  }
  async function save(reconcile = false) {
    const target = reconcile ? pendingSave : preview?.causaId && preview.connectionId && preview.bindingRevision ? { causaId: preview.causaId, connectionId: preview.connectionId, bindingRevision: preview.bindingRevision, requestId: crypto.randomUUID(), documentoId: props.documentId } : null;
    if (!target || busy || !reconcile && (!preview?.canManage || !preview.folder || !preview.document || preview.document.canSave !== true)) return;
    setPendingSave(target); setBusy(true); setMessage(""); setError("");
    const doc = preview?.document;
    const input = reconcile ? { action: "reconcile", requestId: target.requestId, connectionId: target.connectionId, bindingRevision: target.bindingRevision, confirmed: true } : { action: doc?.remoteId && doc.remoteVersion ? "save-version" : "upload-document", requestId: target.requestId, connectionId: target.connectionId, bindingRevision: target.bindingRevision, documentoId: props.documentId, documentVersion: doc!.version, sourceSha256: doc!.sourceSha256, nombre: doc!.name, caseRevision: preview!.caseRevision, ...(doc?.remoteId && doc.remoteVersion ? { fileId: doc.remoteId, expectedVersion: doc.remoteVersion } : {}), confirmed: true };
    const response = await apiMutation<DriveResult>(`/api/causas/${encodeURIComponent(target.causaId)}/drive/commands`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    setBusy(false);
    if (response.ok && response.data.state === "failed") { setPendingSave(null); setPreview(null); setError(response.data.message); return; }
    if (response.ok && response.data.state === "completed" && (reconcile || response.data.file?.id && isRealDriveFolderId(response.data.file.id))) { setPendingSave(null); setPreview(null); const sameDocument = !reconcile || target.documentoId === props.documentId; setMessage(sameDocument ? response.data.message || "Archivo guardado en Drive." : "Operación anterior de Drive comprobada. Ya puedes preparar este documento."); if (sameDocument && response.data.file?.id && isRealDriveFolderId(response.data.file.id)) setSavedUrl(driveFileUrl(response.data.file.id)); router.refresh(); return; }
    if (!response.ok && response.status >= 400 && response.status < 500) setPendingSave(null);
    setError(response.ok ? response.data.message : response.error);
  }
  const nextHref = !preview?.canManage ? "/inicio?altazor=connectors&connector=google" : preview.causaId ? `/causas/${encodeURIComponent(preview.causaId)}#drive-folder` : "/mis-causas";
  const nextLabel = !preview?.canManage ? "Permitir crear y editar" : preview.folder ? "Revisar carpeta" : "Elegir carpeta";
  return <span className="inline-flex max-w-full flex-col items-start gap-2">
    <button type="button" className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--sea)] underline underline-offset-4 disabled:opacity-50" disabled={props.disabled || !canUpload || busy || Boolean(pendingSave)} onClick={() => void prepare()}>{busy ? "Comprobando…" : props.googleDriveId ? "Guardar nueva versión en Drive" : "Guardar en Google Drive"}</button>
    {preview && !pendingSave && <span className="block max-w-lg space-y-3 text-sm">
      {!preview.canManage || !preview.folder || !preview.document || preview.document.canSave !== true ? <span className="block">{!preview.canManage ? "Revisa los permisos de la conexión de Google del estudio para guardar archivos." : preview.document?.reason || preview.reason || "Vincula primero una carpeta de Google Drive a esta causa."} <a href={nextHref} className="underline underline-offset-4">{nextLabel}</a></span> : <>
        <span className="block break-words font-medium">{preview.document.name}</span>
        <span className="block break-words">Carpeta: {preview.folder.name}. Versión {preview.document.version} · {new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 }).format(preview.document.bytes / 1024)} KB.</span>
        <span className="block text-[var(--ink-soft)]">Se guardará una copia en Drive. Las versiones anteriores y el original del expediente se conservan.</span>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>Confirmar guardado en Drive</button>
      </>}
      <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setPreview(null)}>Cancelar</button>
    </span>}
    {pendingSave && <span className="block max-w-lg text-sm" role="status">El guardado no tiene confirmación. Comprueba su resultado antes de solicitar otra copia. <button type="button" className="btn btn-secondary mt-2" disabled={busy} onClick={() => void save(true)}>Comprobar resultado</button></span>}
    {message && <span className="text-sm text-[var(--sea)]" role="status">{message}</span>}
    {error && <span className="text-sm text-[var(--danger)]" role="alert">{error}</span>}
    {(savedUrl || props.googleDriveId) && <a className="inline-flex min-h-11 items-center text-sm text-[var(--sea)] underline underline-offset-4" href={savedUrl || driveFileUrl(props.googleDriveId!)} target="_blank" rel="noreferrer">Abrir en Drive</a>}
    <details className="text-sm"><summary className="min-h-11 cursor-pointer py-3 text-[var(--ink-soft)] underline underline-offset-4">Conexión del estudio (anterior)</summary><LegacyDocumentDriveAction {...props} /></details>
  </span>;
}

function LegacyDocumentDriveAction({
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
