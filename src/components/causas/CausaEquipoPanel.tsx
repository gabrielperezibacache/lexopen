"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiMutation } from "@/lib/api-mutation";

type Member = {
  id: string;
  userId: string;
  rol: string;
  user: { id: string; name: string; email: string; role: string };
};

type StaffOpt = { id: string; name: string; role: string };

const ROL_LABEL: Record<string, string> = {
  responsable: "Responsable",
  colaborador: "Colaborador",
  procurador: "Procurador",
  supervisor: "Supervisor",
  externo: "Externo",
  lectura: "Solo lectura",
};

export function CausaEquipoPanel({
  causaId,
  initialAcceso,
  canManage,
}: {
  causaId: string;
  initialAcceso: string;
  canManage: boolean;
}) {
  const [acceso, setAcceso] = useState(initialAcceso || "estudio");
  const [miembros, setMiembros] = useState<Member[]>([]);
  const [staff, setStaff] = useState<StaffOpt[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function reload() {
    const res = await fetch(`/api/causas/${causaId}/equipo`);
    if (!res.ok) return;
    const data = await res.json();
    setMiembros(data.miembros || []);
    if (data.causa?.acceso) setAcceso(data.causa.acceso);
  }

  useEffect(() => {
    void reload();
    void (async () => {
      const res = await fetch("/api/people?limit=200");
      if (!res.ok) return;
      const data = await res.json();
      setStaff(
        (data.users || [])
          .filter((u: { role: string }) => u.role !== "cliente")
          .map((u: { id: string; name: string; role: string }) => ({
            id: u.id,
            name: u.name,
            role: u.role,
          }))
      );
    })();
  }, [causaId]);

  async function setAccesoMode(next: "estudio" | "equipo") {
    setBusy(true);
    setError(null);
    const result = await apiMutation(`/api/causas/${causaId}/equipo`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acceso: next }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "No se pudo cambiar el acceso");
      return;
    }
    setAcceso(next);
    setMsg(
      next === "equipo"
        ? "Muro ético activo: solo el equipo ve esta causa."
        : "Acceso de estudio: todo el staff puede ver la causa."
    );
  }

  async function addMember(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const result = await apiMutation(`/api/causas/${causaId}/equipo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: fd.get("userId"),
        rol: fd.get("rol"),
      }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "No se pudo agregar");
      return;
    }
    e.currentTarget.reset();
    await reload();
  }

  async function removeMember(userId: string) {
    setBusy(true);
    setError(null);
    const result = await apiMutation(
      `/api/causas/${causaId}/equipo?userId=${encodeURIComponent(userId)}`,
      { method: "DELETE" }
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "No se pudo quitar");
      return;
    }
    await reload();
  }

  return (
    <section className="panel space-y-4 rounded-3xl p-5">
      <div>
        <h2 className="text-lg font-semibold">Equipo de la causa</h2>
        <p className="text-sm text-[var(--ink-soft)]/70">
          Miembros y muro ético. Por defecto el estudio completo ve la causa;
          con acceso «equipo» solo los miembros (y socios con override auditado).
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      {msg && (
        <p className="text-sm text-[var(--sea)]" role="status">
          {msg}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-[var(--ink-soft)]/70">Acceso:</span>
        <button
          type="button"
          className={`btn ${acceso === "estudio" ? "btn-primary" : "btn-ghost"}`}
          disabled={!canManage || busy}
          onClick={() => void setAccesoMode("estudio")}
        >
          Estudio
        </button>
        <button
          type="button"
          className={`btn ${acceso === "equipo" ? "btn-primary" : "btn-ghost"}`}
          disabled={!canManage || busy}
          onClick={() => void setAccesoMode("equipo")}
        >
          Solo equipo (muro ético)
        </button>
      </div>

      <ul className="divide-y divide-[var(--line)]">
        {miembros.map((m) => (
          <li
            key={m.id}
            className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
          >
            <div>
              <div className="font-medium">{m.user.name}</div>
              <div className="text-xs text-[var(--ink-soft)]/65">
                {ROL_LABEL[m.rol] || m.rol} · {m.user.email}
              </div>
            </div>
            {canManage && m.rol !== "responsable" && (
              <button
                type="button"
                className="btn btn-ghost text-xs"
                disabled={busy}
                onClick={() => void removeMember(m.userId)}
              >
                Quitar
              </button>
            )}
          </li>
        ))}
        {miembros.length === 0 && (
          <li className="py-2 text-sm text-[var(--ink-soft)]/65">
            Sin miembros registrados aún.
          </li>
        )}
      </ul>

      {canManage && (
        <form onSubmit={addMember} className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-[var(--ink-soft)]/65">
              Persona
            </span>
            <select className="select" name="userId" required>
              <option value="">Elegir…</option>
              {staff.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-[var(--ink-soft)]/65">
              Rol en la causa
            </span>
            <select className="select" name="rol" defaultValue="colaborador">
              {Object.entries(ROL_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            Agregar
          </button>
        </form>
      )}
    </section>
  );
}
