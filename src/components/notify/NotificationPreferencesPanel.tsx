"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { WhatsAppLinkPanel } from "./WhatsAppLinkPanel";
import { apiMutation } from "@/lib/api-mutation";

type MatrizRow = {
  tipo: string;
  label: string;
  apagable: boolean;
  canales: Record<string, string>;
};

type CanalRow = {
  id: string;
  canal: string;
  estado: string;
  nivelDetalle: string;
  verificadoAt: string | null;
};

type State = {
  perfil: {
    quietDesde: string;
    quietHasta: string;
    quietFinesSemana: boolean;
    zonaHoraria: string;
    nivelEmail: string;
    silenciadoHasta: string | null;
  };
  matriz: MatrizRow[];
  canales: CanalRow[];
  email: string;
};

const MODOS = [
  { value: "realtime", label: "Tiempo real" },
  { value: "digest_diario", label: "Digest diario" },
  { value: "digest_semanal", label: "Digest semanal" },
  { value: "off", label: "Apagado" },
];

export function NotificationPreferencesPanel() {
  const [state, setState] = useState<State | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/notify/preferences");
    if (!res.ok) {
      setState(null);
      return;
    }
    setState(await res.json());
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      void load();
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!state) return;
    setSaving(true);
    setMessage("");
    const prefs = state.matriz.flatMap((row) =>
      Object.entries(row.canales).map(([canal, modo]) => ({
        tipo: row.tipo,
        canal,
        modo,
      }))
    );
    const result = await apiMutation("/api/notify/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefs, perfil: state.perfil }),
    });
    setSaving(false);
    if (!result.ok) {
      setMessage(result.error || "No se pudo guardar");
      return;
    }
    setMessage("Preferencias guardadas");
    await load();
  }

  if (!state) {
    return (
      <p className="text-sm text-[var(--ink-soft)]/70">Cargando preferencias…</p>
    );
  }

  return (
    <form className="min-w-0 space-y-6" onSubmit={onSave}>
      <section className="panel space-y-3 rounded-3xl p-5">
        <h2 className="font-semibold">Horas de silencio</h2>
        <p className="text-sm text-[var(--ink-soft)]/70">
          Los plazos fatales atraviesan el silencio. Email del Host: {state.email}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid min-w-0 gap-1.5 text-sm font-medium">
            Desde
            <input
              className="input"
              value={state.perfil.quietDesde}
              onChange={(e) =>
                setState({
                  ...state,
                  perfil: { ...state.perfil, quietDesde: e.target.value },
                })
              }
              pattern="\d{2}:\d{2}"
              required
            />
          </label>
          <label className="grid min-w-0 gap-1.5 text-sm font-medium">
            Hasta
            <input
              className="input"
              value={state.perfil.quietHasta}
              onChange={(e) =>
                setState({
                  ...state,
                  perfil: { ...state.perfil, quietHasta: e.target.value },
                })
              }
              pattern="\d{2}:\d{2}"
              required
            />
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={state.perfil.quietFinesSemana}
              onChange={(e) =>
                setState({
                  ...state,
                  perfil: {
                    ...state.perfil,
                    quietFinesSemana: e.target.checked,
                  },
                })
              }
            />
            Silenciar fines de semana
          </label>
        </div>
        <label className="grid max-w-md gap-1.5 text-sm font-medium">
          Detalle del email
          <select
            className="select"
            value={state.perfil.nivelEmail}
            onChange={(e) =>
              setState({
                ...state,
                perfil: { ...state.perfil, nivelEmail: e.target.value },
              })
            }
          >
            <option value="minimo">Mínimo</option>
            <option value="estandar">Estándar</option>
            <option value="detallado">Detallado</option>
          </select>
        </label>
      </section>

      <WhatsAppLinkPanel active={state.canales.some(c => c.canal === "whatsapp" && c.estado === "activo")} onChanged={load} />
      <section className="panel space-y-3 rounded-3xl p-5">
        <h2 className="font-semibold">Matriz evento × canal</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-[var(--ink-soft)]">
                <th className="py-2 pr-3 font-medium">Evento</th>
                <th className="py-2 pr-3 font-medium">Email</th>
                <th className="py-2 pr-3 font-medium">Telegram</th>
                <th className="py-2 font-medium">Push</th>
                <th className="py-2 font-medium">WhatsApp</th>
              </tr>
            </thead>
            <tbody>
              {state.matriz.map((row, idx) => (
                <tr key={row.tipo} className="border-b border-[var(--line)]/60">
                  <td className="py-2 pr-3">
                    {row.label}
                    {!row.apagable && (
                      <span className="ml-2 text-xs text-[var(--copper)]">
                        obligatorio
                      </span>
                    )}
                  </td>
                  {(["email", "telegram", "push", "whatsapp"] as const).map((canal) => (
                    <td key={canal} className="py-2 pr-3">
                      <select
                        className="select min-w-[9rem]"
                        aria-label={`${row.label} · ${canal}`}
                        value={row.canales[canal]}
                        onChange={(e) => {
                          const matriz = [...state.matriz];
                          matriz[idx] = {
                            ...row,
                            canales: { ...row.canales, [canal]: e.target.value },
                          };
                          setState({ ...state, matriz });
                        }}
                      >
                        {MODOS.filter(
                          (m) => canal === "whatsapp" || row.apagable || m.value !== "off"
                        ).map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? "Guardando…" : "Guardar preferencias"}
        </button>
        {message && (
          <p className="text-sm text-[var(--ink-soft)]" role="status">{message}</p>
        )}
      </div>
    </form>
  );
}
