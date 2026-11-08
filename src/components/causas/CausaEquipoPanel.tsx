"use client";

import { FormEvent, useState, useRef } from "react";
import { apiMutation } from "@/lib/api-mutation";

type Member = {
  id: string;
  userId: string;
  rol: string;
  user: { id: string; name: string; email: string; role: string };
};

type StaffOpt = { id: string; name: string; role?: string };

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
  initialMiembros,
  staffOptions,
  canManage,
}: {
  causaId: string;
  initialAcceso: string;
  initialMiembros: Member[];
  staffOptions: StaffOpt[];
  canManage: boolean;
}) {
  const [acceso, setAcceso] = useState(initialAcceso || "estudio");
  const [miembros, setMiembros] = useState(initialMiembros);
  const [pending, setPending] = useState<{ kind: "access" | "add" | "remove"; userId?: string } | null>(null);
  const active = useRef(false);
  const busy = pending !== null;
  function begin(action: NonNullable<typeof pending>) {
    if (!canManage || active.current) return false;
    active.current = true; setPending(action); setError(null); setMsg(null); return true;
  }
  function finish() { active.current = false; setPending(null); }
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function reload() {
    const res = await fetch(`/api/causas/${causaId}/equipo`);
    if (!res.ok) throw new Error("No se pudo actualizar el equipo");
    const data = await res.json();
    setMiembros(data.miembros || []);
    if (data.causa?.acceso) setAcceso(data.causa.acceso);
  }

  async function setAccesoMode(next: "estudio" | "equipo") {
    if (!begin({ kind: "access" })) return;
    try {
      const result = await apiMutation(`/api/causas/${causaId}/equipo`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acceso: next }),
      });
      if (!result.ok) { setError(result.error || "No se pudo cambiar el acceso"); return; }
      setAcceso(next);
      setMsg(next === "equipo" ? "Muro ético activo: solo el equipo ve esta causa." : "Acceso de estudio: todo el staff puede ver la causa.");
    } finally { finish(); }
  }

  async function addMember(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget, fd = new FormData(form);
    if (!begin({ kind: "add" })) return;
    try {
      const result = await apiMutation(`/api/causas/${causaId}/equipo`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: fd.get("userId"), rol: fd.get("rol") }),
      });
      if (!result.ok) { setError(result.error || "No se pudo agregar"); return; }
      form.reset();
      await reload();
    } catch { setError("El cambio se envió, pero no se pudo actualizar el equipo. Recargue la causa para comprobarlo."); }
    finally { finish(); }
  }

  async function removeMember(userId: string) {
    if (!begin({ kind: "remove", userId })) return;
    try {
      const result = await apiMutation(`/api/causas/${causaId}/equipo?userId=${encodeURIComponent(userId)}`, { method: "DELETE" });
      if (!result.ok) { setError(result.error || "No se pudo quitar"); return; }
      await reload();
    } catch { setError("El cambio se envió, pero no se pudo actualizar el equipo. Recargue la causa para comprobarlo."); }
    finally { finish(); }
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

      <div
        className="flex flex-wrap items-center gap-3"
        role="group"
        aria-label="Nivel de acceso"
        aria-busy={pending?.kind === "access"}
      >
        <span className="text-sm text-[var(--ink-soft)]/70">Acceso:</span>
        <button
          type="button"
          className={`btn ${acceso === "estudio" ? "btn-primary" : "btn-ghost"}`}
          aria-pressed={acceso === "estudio"}
          disabled={!canManage || busy}
          onClick={() => void setAccesoMode("estudio")}
        >
          Estudio
        </button>
        <button
          type="button"
          className={`btn ${acceso === "equipo" ? "btn-primary" : "btn-ghost"}`}
          aria-pressed={acceso === "equipo"}
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
                aria-label={`${pending?.kind === "remove" && pending.userId === m.userId ? "Quitando" : "Quitar"} a ${m.user.name}`}
                disabled={busy}
                onClick={() => void removeMember(m.userId)}
              >
                {pending?.kind === "remove" && pending.userId === m.userId ? "Quitando…" : "Quitar"}
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
            <select className="select" name="userId" required disabled={busy}>
              <option value="">Elegir…</option>
              {staffOptions.map((u) => (
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
            <select className="select" name="rol" defaultValue="colaborador" disabled={busy}>
              {Object.entries(ROL_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={busy}
            aria-busy={pending?.kind === "add"}
          >
            {pending?.kind === "add" ? "Agregando…" : "Agregar"}
          </button>
        </form>
      )}
    </section>
  );
}
