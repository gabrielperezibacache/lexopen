"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Detection = {
  looksLikeDemo: boolean;
  demoUsers: number;
  users: number;
  causas: number;
  clientes: number;
  confirmPhrase: string;
  hint?: string;
};

export function PurgeDemoPanel() {
  const router = useRouter();
  const [info, setInfo] = useState<Detection | null>(null);
  const [confirm, setConfirm] = useState("");
  const [keepCatalogs, setKeepCatalogs] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch("/api/admin/purge-demo")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setInfo(d))
      .catch(() => setInfo(null));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/purge-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm, keepCatalogs }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error || "No se pudo purgar");
        return;
      }
      setDone(true);
      setMessage(data.next || "Datos eliminados.");
      router.refresh();
    } catch {
      setMessage("Error de red al purgar.");
    } finally {
      setBusy(false);
    }
  }

  if (!info) {
    return (
      <section id="purge-demo" className="panel rounded-3xl border border-[var(--line)] p-5">
        <h2 className="text-lg font-semibold">Datos demo → producción</h2>
        <p className="mt-2 text-sm text-[var(--ink-soft)]/70">Cargando estado…</p>
      </section>
    );
  }

  return (
    <section id="purge-demo" className="panel space-y-4 rounded-3xl border border-rose-200/80 bg-rose-50/40 p-5">
      <div>
        <h2 className="text-lg font-semibold text-rose-950">
          Eliminar datos demo (pasar a producción)
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-rose-950/80">
          Borra causas, clientes, usuarios y el resto del contenido operativo.
          La base queda vacía para crear el administrador real en{" "}
          <code>/setup</code>. No borra el schema ni las migraciones.
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs uppercase tracking-wide text-rose-900/55">Usuarios</dt>
          <dd className="font-semibold">{info.users}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-rose-900/55">Demo</dt>
          <dd className="font-semibold">{info.demoUsers}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-rose-900/55">Causas</dt>
          <dd className="font-semibold">{info.causas}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-rose-900/55">Clientes</dt>
          <dd className="font-semibold">{info.clientes}</dd>
        </div>
      </dl>

      {info.looksLikeDemo ? (
        <p className="rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Se detectaron usuarios del seed demo (<code>socio@estudio.cl</code>, etc.).
        </p>
      ) : (
        <p className="text-sm text-rose-900/75">
          No hay emails demo típicos, pero la purga igual borrará{" "}
          <strong>todo</strong> el contenido operativo.
        </p>
      )}

      {done ? (
        <div className="space-y-3 rounded-2xl border border-rose-300 bg-white/80 p-4 text-sm text-rose-950">
          <p className="font-semibold">Datos eliminados.</p>
          <p>{message}</p>
          <ol className="list-decimal space-y-1 pl-5 text-rose-950/85">
            <li>
              En el servidor:{" "}
              <code>LEXOPEN_DEMO_SWITCHER=0</code>,{" "}
              <code>HERMES_ALLOW_DEMO=0</code>, <code>PJUD_ALLOW_DEMO=0</code>
            </li>
            <li>
              <code>export LEXOPEN_BOOTSTRAP_TOKEN=$(openssl rand -hex 24)</code>
            </li>
            <li>
              Abra <code>/setup?token=…</code> y cree el admin del estudio
            </li>
          </ol>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3">
          <label className="flex items-start gap-2 text-sm text-rose-950/90">
            <input
              type="checkbox"
              className="mt-1"
              checked={keepCatalogs}
              onChange={(e) => setKeepCatalogs(e.target.checked)}
            />
            <span>
              Conservar catálogos Chile (tribunales, UF, plantillas de minuta)
            </span>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-rose-950">
              Escriba {info.confirmPhrase} para confirmar
            </span>
            <input
              className="input border-rose-300 bg-white"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={info.confirmPhrase}
              autoComplete="off"
              required
            />
          </label>
          {message && !done && (
            <p className="text-sm text-rose-800" role="alert">
              {message}
            </p>
          )}
          <button
            type="submit"
            className="btn bg-rose-700 text-white hover:bg-rose-800"
            disabled={busy || confirm !== info.confirmPhrase}
          >
            {busy ? "Eliminando…" : "Eliminar datos y preparar producción"}
          </button>
          <p className="text-xs text-rose-900/60">
            También puede hacerlo por CLI:{" "}
            <code>npm run db:purge-demo -- --yes</code>
          </p>
        </form>
      )}
    </section>
  );
}
