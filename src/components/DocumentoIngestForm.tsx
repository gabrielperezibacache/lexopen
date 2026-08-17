"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  inferDocumentoTipo,
  normalizeIngestPath,
  shouldSkipIngestFile,
  sortIngestFiles,
} from "@/lib/document-ingest";
import { apiMutation } from "@/lib/api-mutation";

type CausaOption = { id: string; label: string };

type FileRow = {
  key: string;
  file: File;
  relativePath: string;
  ruta: string | null;
  nombre: string;
  status: "pending" | "uploading" | "ok" | "error" | "skipped";
  message?: string;
};

type Props = {
  causas?: CausaOption[];
  /** When set, causa is locked (e.g. from causa detail). */
  lockedCausaId?: string | null;
  /** Associate uploads with a CRM client folder. */
  lockedClienteId?: string | null;
  compact?: boolean;
  onComplete?: () => void;
};

function buildRows(fileList: FileList | null): FileRow[] {
  if (!fileList?.length) return [];
  const files = sortIngestFiles(Array.from(fileList));
  const rows: FileRow[] = [];
  for (const file of files) {
    const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    if (shouldSkipIngestFile(file)) {
      rows.push({
        key: `${relative}-${file.size}`,
        file,
        relativePath: relative,
        ruta: null,
        nombre: file.name,
        status: "skipped",
        message: "Ignorado (vacío o metadatos del sistema)",
      });
      continue;
    }
    const parts = normalizeIngestPath(relative);
    if (!parts) {
      rows.push({
        key: `${relative}-${file.size}`,
        file,
        relativePath: relative,
        ruta: null,
        nombre: file.name,
        status: "skipped",
        message: "Ruta no válida",
      });
      continue;
    }
    rows.push({
      key: `${parts.relativePath}-${file.size}-${file.lastModified}`,
      file,
      relativePath: parts.relativePath,
      ruta: parts.ruta,
      nombre: parts.nombre,
      status: "pending",
    });
  }
  return rows;
}

export function DocumentoIngestForm({
  causas = [],
  lockedCausaId = null,
  lockedClienteId = null,
  compact = false,
  onComplete,
}: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"files" | "folder">("files");
  const [rows, setRows] = useState<FileRow[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tipo, setTipo] = useState("auto");
  const [causaId, setCausaId] = useState(lockedCausaId || "");
  const [confidencial, setConfidencial] = useState(false);
  const [privilegio, setPrivilegio] = useState(false);
  const [pushDrive, setPushDrive] = useState(false);

  const pendingCount = useMemo(
    () => rows.filter((r) => r.status === "pending" || r.status === "uploading").length,
    [rows]
  );
  const okCount = useMemo(() => rows.filter((r) => r.status === "ok").length, [rows]);
  const errCount = useMemo(() => rows.filter((r) => r.status === "error").length, [rows]);

  function onPick(list: FileList | null) {
    setError("");
    setRows(buildRows(list));
  }

  async function uploadOne(row: FileRow, resolvedCausaId: string, resolvedTipo: string) {
    const fd = new FormData();
    fd.set("file", row.file, row.nombre);
    fd.set("nombre", row.nombre);
    fd.set("tipo", resolvedTipo === "auto" ? "auto" : resolvedTipo);
    if (row.ruta) fd.set("ruta", row.ruta);
    fd.set("relativePath", row.relativePath);
    if (resolvedCausaId) fd.set("causaId", resolvedCausaId);
    if (lockedClienteId) fd.set("clienteId", lockedClienteId);
    if (confidencial) fd.set("confidencial", "on");
    if (privilegio) fd.set("privilegio", "on");

    const result = await apiMutation<{ id?: string }>("/api/documentos", {
      method: "POST",
      body: fd,
    });
    if (!result.ok) {
      throw new Error(result.error || "No se pudo subir el documento");
    }
    const body = result.data;

    if (pushDrive && body.id && resolvedCausaId) {
      const driveResult = await apiMutation<{
        error?: string;
        status?: string;
        message?: string;
      }>("/api/integrations/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "push-documento", documentoId: body.id }),
      });
      if (!driveResult.ok && driveResult.error) {
        return { warning: `Subido localmente; Drive: ${driveResult.error}` };
      }
      const driveBody = driveResult.ok ? driveResult.data : {};
      if (driveBody.status && driveBody.status !== "uploaded") {
        return {
          warning:
            driveBody.message ||
            `Subido localmente; Drive: ${driveBody.status}`,
        };
      }
    }
    return {};
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!rows.some((r) => r.status === "pending" || r.status === "error")) {
      setError("Seleccione archivos o una carpeta investigativa");
      return;
    }
    setBusy(true);
    const resolvedCausaId = lockedCausaId || causaId;
    let uploaded = 0;

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i]!;
      if (row.status === "skipped" || row.status === "ok") continue;
      setRows((prev) =>
        prev.map((r, idx) => (idx === i ? { ...r, status: "uploading", message: undefined } : r))
      );
      try {
        const result = await uploadOne(row, resolvedCausaId, tipo);
        uploaded += 1;
        setRows((prev) =>
          prev.map((r, idx) =>
            idx === i
              ? {
                  ...r,
                  status: "ok",
                  message: result.warning || "Listo · en cola de extracción",
                }
              : r
          )
        );
      } catch (err) {
        setRows((prev) =>
          prev.map((r, idx) =>
            idx === i
              ? {
                  ...r,
                  status: "error",
                  message: err instanceof Error ? err.message : "Error",
                }
              : r
          )
        );
      }
    }

    setBusy(false);
    if (uploaded > 0) {
      router.refresh();
      onComplete?.();
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className={`panel space-y-4 rounded-3xl p-5 ${compact ? "" : ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Incorporar al expediente</h2>
          <p className="mt-1 text-sm text-[var(--ink-soft)]/75">
            Suba archivos sueltos o una carpeta investigativa completa. Se preserva la
            estructura de subcarpetas y se encola el OCR/Markdown.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className={`btn ${mode === "files" ? "btn-secondary" : "btn-ghost"}`}
            onClick={() => {
              setMode("files");
              setRows([]);
              fileRef.current?.click();
            }}
          >
            Archivos
          </button>
          <button
            type="button"
            className={`btn ${mode === "folder" ? "btn-secondary" : "btn-ghost"}`}
            onClick={() => {
              setMode("folder");
              setRows([]);
              folderRef.current?.click();
            }}
          >
            Carpeta
          </button>
        </div>
      </div>

      <input
        ref={fileRef}
        className="hidden"
        type="file"
        multiple
        onChange={(e) => {
          setMode("files");
          onPick(e.target.files);
        }}
      />
      <input
        ref={folderRef}
        className="hidden"
        type="file"
        multiple
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        onChange={(e) => {
          setMode("folder");
          onPick(e.target.files);
        }}
      />

      <div className={`grid gap-3 grid-cols-1 ${compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4"}`}>
        <div>
          <label className="mb-1 block text-sm font-medium">Tipo</label>
          <select
            className="select"
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
          >
            <option value="auto">Auto (según carpeta/nombre)</option>
            <option value="escrito">Escrito</option>
            <option value="contrato">Contrato</option>
            <option value="minuta">Minuta</option>
            <option value="evidencia">Evidencia</option>
            <option value="notificacion">Notificación</option>
            <option value="otro">Otro</option>
          </select>
        </div>
        {!lockedCausaId && (
          <div>
            <label className="mb-1 block text-sm font-medium">Causa</label>
            <select
              className="select"
              value={causaId}
              onChange={(e) => setCausaId(e.target.value)}
            >
              <option value="">Sin causa</option>
              {causas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            checked={confidencial}
            onChange={(e) => setConfidencial(e.target.checked)}
          />
          Confidencial
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            checked={privilegio}
            onChange={(e) => setPrivilegio(e.target.checked)}
          />
          Privilegio
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={pushDrive}
          onChange={(e) => setPushDrive(e.target.checked)}
        />
        Intentar subir a Google Drive (texto/markdown; requiere carpeta real en la causa)
      </label>

      {rows.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-[var(--line)]">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-[var(--ink)] px-4 py-2 text-xs text-white/85">
            <span>
              {rows.length} ítem(s)
              {mode === "folder" ? " · carpeta" : ""}
              {okCount ? ` · ${okCount} ok` : ""}
              {errCount ? ` · ${errCount} error` : ""}
              {busy && pendingCount ? ` · quedan ${pendingCount}` : ""}
            </span>
            <button
              type="button"
              className="text-white/80 underline"
              disabled={busy}
              onClick={() => setRows([])}
            >
              Limpiar lista
            </button>
          </div>
          <ul className="max-h-56 overflow-y-auto divide-y divide-[var(--line)] bg-white/70 text-sm">
            {rows.map((row) => (
              <li key={row.key} className="flex min-w-0 flex-col gap-2 px-4 py-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="break-all font-medium sm:truncate">{row.relativePath}</div>
                  <div className="text-xs text-[var(--ink-soft)]/65">
                    {row.message ||
                      (row.status === "pending"
                        ? tipo === "auto"
                          ? `Tipo sugerido: ${inferDocumentoTipo(row.relativePath)}`
                          : tipo
                        : row.status)}
                  </div>
                </div>
                <span
                  className={
                    row.status === "ok"
                      ? "text-[var(--sea)]"
                      : row.status === "error"
                        ? "text-red-700"
                        : row.status === "skipped"
                          ? "text-[var(--ink-soft)]/55"
                          : "text-[var(--ink-soft)]/70"
                  }
                >
                  {row.status === "uploading"
                    ? "…"
                    : row.status === "ok"
                      ? "OK"
                      : row.status === "error"
                        ? "Error"
                        : row.status === "skipped"
                          ? "Omitido"
                          : "Pendiente"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {rows.length === 0 && (
          <p className="mr-auto text-sm text-[var(--ink-soft)]/65">
            Elija <strong>Archivos</strong> o <strong>Carpeta</strong> para preparar la carga.
          </p>
        )}
        <button className="btn btn-primary" disabled={busy || rows.length === 0} type="submit">
          {busy
            ? `Incorporando… (${okCount}/${rows.filter((r) => r.status !== "skipped").length})`
            : rows.length
              ? `Incorporar ${rows.filter((r) => r.status === "pending" || r.status === "error").length || rows.filter((r) => r.status !== "skipped").length}`
              : "Incorporar"}
        </button>
      </div>
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
    </form>
  );
}
