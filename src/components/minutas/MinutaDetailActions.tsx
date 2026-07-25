"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

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
  hasDriveFolder,
  googleDriveFileId,
}: {
  minutaId: string;
  acciones: Accion[];
  hasDriveFolder: boolean;
  googleDriveFileId?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState("");

  function setEstado(accionId: string, estado: string) {
    startTransition(async () => {
      await fetch(`/api/minutas/${minutaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "accion-estado",
          accionId,
          estado,
        }),
      });
      router.refresh();
    });
  }

  function pushDrive() {
    startTransition(async () => {
      setMsg("");
      const res = await fetch(`/api/minutas/${minutaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "push-drive" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || "Error");
        return;
      }
      setMsg(
        data.message ||
          (data.status === "uploaded"
            ? "Minuta subida a la carpeta Drive de la causa"
            : data.status === "stub"
              ? "Modo stub: conecte Google OAuth para subir"
              : JSON.stringify(data.status))
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <section className="panel rounded-3xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Acciones de seguimiento</h2>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={pending || !hasDriveFolder}
            onClick={pushDrive}
            title={
              hasDriveFolder
                ? "Subir a Drive"
                : "Vincule una carpeta Drive en la causa"
            }
          >
            {googleDriveFileId ? "Re-subir a Drive" : "Subir a Drive"}
          </button>
        </div>
        {msg && (
          <p className="mt-3 text-sm text-[var(--ink-soft)]/75">{msg}</p>
        )}
        <div className="mt-4 space-y-3">
          {acciones.map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--line)] px-3 py-3"
            >
              <div>
                <div className="text-sm font-medium">{a.descripcion}</div>
                <div className="text-xs text-[var(--ink-soft)]/65">
                  {a.responsable || "Sin asignar"} · {a.prioridad} ·{" "}
                  {a.estado}
                </div>
              </div>
              {a.estado !== "hecha" ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={pending}
                  onClick={() => setEstado(a.id, "hecha")}
                >
                  Marcar hecha
                </button>
              ) : (
                <span className="badge badge-activa">hecha</span>
              )}
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
