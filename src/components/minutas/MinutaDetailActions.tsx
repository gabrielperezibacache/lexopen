"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatLocalDate } from "@/lib/minutas";
import { driveFileUrl, isRealDriveFolderId } from "@/lib/integrations/drive-folder";

type Accion = {
  id: string;
  descripcion: string;
  estado: string;
  responsable: string | null;
  fechaLimite: string | Date | null;
  prioridad: string;
};

export function MinutaDetailActions({
  minutaId,
  acciones,
  folderId,
  googleDriveFileId,
  aviso,
}: {
  minutaId: string;
  acciones: Accion[];
  folderId?: string | null;
  googleDriveFileId?: string | null;
  aviso?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState(aviso || "");
  const [error, setError] = useState("");
  const hasRealFolder = isRealDriveFolderId(folderId);

  function setEstado(accionId: string, estado: string) {
    setError("");
    startTransition(async () => {
      try {
        const res = await fetch(`/api/minutas/${minutaId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "accion-estado",
            accionId,
            estado,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || "No se pudo actualizar la acción");
          return;
        }
        router.refresh();
      } catch {
        setError("Error de red al actualizar la acción");
      }
    });
  }

  function pushDrive() {
    setMsg("");
    setError("");
    startTransition(async () => {
      try {
        const res = await fetch(`/api/minutas/${minutaId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "push-drive" }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || data.message || "Error al subir a Drive");
          return;
        }
        setMsg(
          data.message ||
            (data.status === "uploaded"
              ? "Minuta subida a la carpeta Drive de la causa"
              : data.status === "stub"
                ? "Modo stub: conecte Google OAuth para subir"
                : String(data.status))
        );
        router.refresh();
      } catch {
        setError("Error de red al subir a Drive");
      }
    });
  }

  return (
    <div className="space-y-4">
      <section className="panel rounded-3xl p-5">
        <h2 className="text-lg font-semibold">Google Drive</h2>
        <p className="mt-1 text-sm text-[var(--ink-soft)]/70">
          {hasRealFolder
            ? "Suba esta minuta a la carpeta del expediente."
            : "Vincule una carpeta real en la causa para habilitar la subida."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={pending || !hasRealFolder}
            onClick={pushDrive}
          >
            {googleDriveFileId ? "Re-subir a Drive" : "Subir a Drive"}
          </button>
          {googleDriveFileId && !googleDriveFileId.startsWith("stub") && (
            <a
              href={driveFileUrl(googleDriveFileId)}
              target="_blank"
              rel="noreferrer"
              className="btn btn-ghost"
            >
              Abrir archivo
            </a>
          )}
        </div>
        {msg && (
          <p className="mt-3 text-sm text-[var(--sea)]" role="status">
            {msg}
          </p>
        )}
        {error && (
          <p className="mt-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
      </section>

      <section className="panel rounded-3xl p-5">
        <h2 className="text-lg font-semibold">Acciones de seguimiento</h2>
        <div className="mt-4 space-y-3">
          {acciones.map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--line)] px-3 py-3"
            >
              <div>
                <div className="text-sm font-medium">{a.descripcion}</div>
                <div className="text-xs text-[var(--ink-soft)]/65">
                  {a.responsable || "Sin asignar"} · {a.prioridad} · plazo{" "}
                  {formatLocalDate(a.fechaLimite)} · {a.estado}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {a.estado !== "hecha" && a.estado !== "cancelada" ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={pending}
                      onClick={() => setEstado(a.id, "hecha")}
                    >
                      Hecha
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={pending}
                      onClick={() => setEstado(a.id, "cancelada")}
                    >
                      Cancelar
                    </button>
                  </>
                ) : a.estado === "hecha" ? (
                  <>
                    <span className="badge badge-activa">hecha</span>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={pending}
                      onClick={() => setEstado(a.id, "pendiente")}
                    >
                      Reabrir
                    </button>
                  </>
                ) : (
                  <>
                    <span className="badge badge-ink">cancelada</span>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={pending}
                      onClick={() => setEstado(a.id, "pendiente")}
                    >
                      Reabrir
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
          {acciones.length === 0 && (
            <p className="text-sm text-[var(--ink-soft)]/65">
              Sin acciones derivadas.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
