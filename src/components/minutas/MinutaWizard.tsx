"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ETAPAS } from "@/lib/chile";
import {
  MODALIDADES_MINUTA,
  PRIORIDADES_ACCION,
  TIPOS_MINUTA,
} from "@/lib/minutas";

type AccionDraft = {
  key: string;
  descripcion: string;
  responsable: string;
  fechaLimite: string;
  prioridad: string;
  crearPlazo: boolean;
  crearTask: boolean;
};

type Props = {
  causaId: string;
  causaTitulo: string;
  causaRit?: string | null;
  etapaActual?: string | null;
  defaultTipo?: string;
  /** Solo carpeta Drive real (no stub/demo). */
  hasRealDriveFolder?: boolean;
};

function emptyAccion(): AccionDraft {
  return {
    key: Math.random().toString(36).slice(2),
    descripcion: "",
    responsable: "",
    fechaLimite: "",
    prioridad: "media",
    crearPlazo: false,
    crearTask: true,
  };
}

export function MinutaWizard({
  causaId,
  causaTitulo,
  causaRit,
  etapaActual,
  defaultTipo = "audiencia",
  hasRealDriveFolder = false,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [tipo, setTipo] = useState(
    TIPOS_MINUTA.some((t) => t.value === defaultTipo) ? defaultTipo : "audiencia"
  );
  const [titulo, setTitulo] = useState("");
  const [fecha, setFecha] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [modalidad, setModalidad] = useState("presencial");
  const [lugar, setLugar] = useState("");
  const [participantes, setParticipantes] = useState("");
  const [resumenEjecutivo, setResumenEjecutivo] = useState("");
  const [hechosRelevantes, setHechosRelevantes] = useState("");
  const [acuerdos, setAcuerdos] = useState("");
  const [estadoCausaNota, setEstadoCausaNota] = useState("");
  const [riesgosAlertas, setRiesgosAlertas] = useState("");
  const [etapaSugerida, setEtapaSugerida] = useState(etapaActual || "");
  const [actualizarEtapa, setActualizarEtapa] = useState(false);
  const [subirADrive, setSubirADrive] = useState(hasRealDriveFolder);
  const [confidencial, setConfidencial] = useState(false);
  const [acciones, setAcciones] = useState<AccionDraft[]>([emptyAccion()]);

  const steps = useMemo(
    () => ["Contexto", "Qué ocurrió", "Próximos pasos", "Publicar"],
    []
  );

  function updateAccion(key: string, patch: Partial<AccionDraft>) {
    setAcciones((prev) =>
      prev.map((a) => {
        if (a.key !== key) return a;
        const next = { ...a, ...patch };
        if (!next.fechaLimite) next.crearPlazo = false;
        return next;
      })
    );
  }

  function accionesValidas() {
    return acciones.filter((a) => a.descripcion.trim());
  }

  function canNext() {
    if (step === 0) return Boolean(tipo && titulo.trim() && fecha);
    if (step === 1) return Boolean(resumenEjecutivo.trim());
    if (step === 2) {
      return !accionesValidas().some((a) => a.crearPlazo && !a.fechaLimite);
    }
    return true;
  }

  function submit() {
    setError("");
    const invalidPlazo = accionesValidas().find(
      (a) => a.crearPlazo && !a.fechaLimite
    );
    if (invalidPlazo) {
      setError(
        `La acción «${invalidPlazo.descripcion}» tiene «Crear plazo» sin fecha.`
      );
      setStep(2);
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/minutas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            causaId,
            tipo,
            titulo: titulo.trim(),
            fecha,
            modalidad,
            lugar: lugar.trim() || null,
            participantes: participantes.trim(),
            resumenEjecutivo: resumenEjecutivo.trim(),
            hechosRelevantes: hechosRelevantes.trim() || null,
            acuerdos: acuerdos.trim() || null,
            estadoCausaNota: estadoCausaNota.trim() || null,
            riesgosAlertas: riesgosAlertas.trim() || null,
            etapaSugerida: etapaSugerida || null,
            actualizarEtapa,
            confidencial,
            subirADrive: subirADrive && hasRealDriveFolder,
            acciones: accionesValidas().map((a) => ({
              descripcion: a.descripcion.trim(),
              responsable: a.responsable.trim() || undefined,
              fechaLimite: a.fechaLimite || null,
              prioridad: a.prioridad,
              crearPlazo: a.crearPlazo && Boolean(a.fechaLimite),
              crearTask: a.crearTask,
            })),
            proximosPasos: accionesValidas()
              .map((a) => `- ${a.descripcion}`)
              .join("\n"),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || "No se pudo guardar la minuta");
          return;
        }
        const driveWarn =
          Array.isArray(data.warnings) && data.warnings.length > 0
            ? `?aviso=${encodeURIComponent(data.warnings[0])}`
            : "";
        router.push(
          `/causas/${causaId}/minutas/${data.minuta.id}${driveWarn}`
        );
        router.refresh();
      } catch {
        setError("Error de red al guardar la minuta. Intente de nuevo.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="panel rounded-3xl px-5 py-4">
        <div className="text-sm text-[var(--ink-soft)]/70">
          Causa · {causaRit || "Sin RIT"}
        </div>
        <div className="mt-1 font-semibold">{causaTitulo}</div>
        <ol className="mt-4 flex flex-wrap gap-2" aria-label="Pasos del wizard">
          {steps.map((label, i) => (
            <li key={label}>
              <button
                type="button"
                disabled={i > step}
                onClick={() => i <= step && setStep(i)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  i === step
                    ? "bg-[var(--sea)] text-white"
                    : i < step
                      ? "bg-[var(--sea)]/15 text-[var(--sea)]"
                      : "bg-[var(--line)]/60 text-[var(--ink-soft)]/70"
                }`}
                aria-current={i === step ? "step" : undefined}
              >
                {i + 1}. {label}
              </button>
            </li>
          ))}
        </ol>
      </div>

      {step === 0 && (
        <section className="panel space-y-5 rounded-3xl p-5">
          <div>
            <h2 className="text-lg font-semibold">¿Qué tipo de acto fue?</h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]/75">
              Elija el formato: la minuta quedará como handoff para cualquier
              abogado del estudio.
            </p>
          </div>
          <div
            className="grid gap-3 sm:grid-cols-3"
            role="radiogroup"
            aria-label="Tipo de minuta"
          >
            {TIPOS_MINUTA.map((t) => (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={tipo === t.value}
                onClick={() => {
                  setTipo(t.value);
                  if (!titulo.trim()) {
                    setTitulo(
                      t.value === "audiencia"
                        ? "Audiencia"
                        : t.value === "llamada"
                          ? "Llamada con cliente"
                          : "Reunión de coordinación"
                    );
                  }
                }}
                className={`rounded-2xl border px-4 py-4 text-left transition ${
                  tipo === t.value
                    ? "border-[var(--sea)] bg-[var(--sea)]/8"
                    : "border-[var(--line)] bg-white/70 hover:border-[var(--sea)]/40"
                }`}
              >
                <div className="font-semibold">{t.label}</div>
                <div className="mt-1 text-xs text-[var(--ink-soft)]/70">
                  {t.hint}
                </div>
              </button>
            ))}
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--ink-soft)]/70">Título</span>
            <input
              className="input"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej. Audiencia de prueba — testigos demandante"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--ink-soft)]/70">
                Fecha y hora
              </span>
              <input
                className="input"
                type="datetime-local"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--ink-soft)]/70">
                Modalidad
              </span>
              <select
                className="input"
                value={modalidad}
                onChange={(e) => setModalidad(e.target.value)}
              >
                {MODALIDADES_MINUTA.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--ink-soft)]/70">
              Lugar / sala / enlace
            </span>
            <input
              className="input"
              value={lugar}
              onChange={(e) => setLugar(e.target.value)}
              placeholder="Tribunal, oficina, Meet, Zoom…"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--ink-soft)]/70">
              Participantes
            </span>
            <input
              className="input"
              value={participantes}
              onChange={(e) => setParticipantes(e.target.value)}
              placeholder="Abogado estudio, cliente, contraparte, juez…"
            />
          </label>
        </section>
      )}

      {step === 1 && (
        <section className="panel space-y-5 rounded-3xl p-5">
          <div>
            <h2 className="text-lg font-semibold">Información clave</h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]/75">
              Escriba lo que otro abogado necesita saber mañana para seguir sin
              perder el hilo.
            </p>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--ink-soft)]/70">
              Resumen ejecutivo *
            </span>
            <textarea
              className="input min-h-[110px]"
              value={resumenEjecutivo}
              onChange={(e) => setResumenEjecutivo(e.target.value)}
              placeholder="En 3–6 líneas: qué pasó y qué implica para la causa."
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--ink-soft)]/70">
              Hechos relevantes
            </span>
            <textarea
              className="input min-h-[90px]"
              value={hechosRelevantes}
              onChange={(e) => setHechosRelevantes(e.target.value)}
              placeholder="Declaraciones, documentos exhibidos, incidencias…"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--ink-soft)]/70">
              Acuerdos / resoluciones
            </span>
            <textarea
              className="input min-h-[90px]"
              value={acuerdos}
              onChange={(e) => setAcuerdos(e.target.value)}
              placeholder="Lo resuelto por el tribunal o acordado con las partes."
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--ink-soft)]/70">
              Cómo queda la causa
            </span>
            <textarea
              className="input min-h-[80px]"
              value={estadoCausaNota}
              onChange={(e) => setEstadoCausaNota(e.target.value)}
              placeholder="Estado procesal tras el acto (para handoff)."
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--ink-soft)]/70">
              Riesgos y alertas
            </span>
            <textarea
              className="input min-h-[70px]"
              value={riesgosAlertas}
              onChange={(e) => setRiesgosAlertas(e.target.value)}
              placeholder="Plazos fatales, riesgos de prueba, fricciones con cliente…"
            />
          </label>
        </section>
      )}

      {step === 2 && (
        <section className="panel space-y-5 rounded-3xl p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Próximos pasos</h2>
              <p className="mt-1 text-sm text-[var(--ink-soft)]/75">
                Cada acción puede crear task y/o plazo en la causa.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setAcciones((a) => [...a, emptyAccion()])}
            >
              + Acción
            </button>
          </div>
          <div className="space-y-4">
            {acciones.map((a, idx) => (
              <div
                key={a.key}
                className="rounded-2xl border border-[var(--line)] bg-white/70 p-4"
              >
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--ink-soft)]/55">
                  Acción {idx + 1}
                </div>
                <input
                  className="input"
                  value={a.descripcion}
                  onChange={(e) =>
                    updateAccion(a.key, { descripcion: e.target.value })
                  }
                  placeholder="Ej. Presentar lista de testigos"
                />
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <input
                    className="input"
                    value={a.responsable}
                    onChange={(e) =>
                      updateAccion(a.key, { responsable: e.target.value })
                    }
                    placeholder="Responsable"
                  />
                  <input
                    className="input"
                    type="date"
                    value={a.fechaLimite}
                    onChange={(e) =>
                      updateAccion(a.key, {
                        fechaLimite: e.target.value,
                        crearPlazo: e.target.value
                          ? a.crearPlazo || true
                          : false,
                      })
                    }
                  />
                  <select
                    className="input"
                    value={a.prioridad}
                    onChange={(e) =>
                      updateAccion(a.key, { prioridad: e.target.value })
                    }
                  >
                    {PRIORIDADES_ACCION.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-3 flex flex-wrap gap-4 text-sm text-[var(--ink-soft)]/80">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={a.crearTask}
                      onChange={(e) =>
                        updateAccion(a.key, { crearTask: e.target.checked })
                      }
                    />
                    Crear task
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={a.crearPlazo}
                      disabled={!a.fechaLimite}
                      onChange={(e) =>
                        updateAccion(a.key, { crearPlazo: e.target.checked })
                      }
                    />
                    Crear plazo{!a.fechaLimite ? " (requiere fecha)" : ""}
                  </label>
                  {acciones.length > 1 && (
                    <button
                      type="button"
                      className="text-[var(--copper)]"
                      onClick={() =>
                        setAcciones((prev) =>
                          prev.filter((x) => x.key !== a.key)
                        )
                      }
                    >
                      Quitar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="panel space-y-5 rounded-3xl p-5">
          <div>
            <h2 className="text-lg font-semibold">Publicar y notificar</h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]/75">
              Se genera documento Markdown, actividad en la causa y aviso al
              equipo.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--ink-soft)]/70">
                Etapa sugerida
              </span>
              <select
                className="input"
                value={etapaSugerida}
                onChange={(e) => setEtapaSugerida(e.target.value)}
              >
                <option value="">Sin cambio</option>
                {ETAPAS.map((e) => (
                  <option key={e.value} value={e.value}>
                    {e.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-col justify-end gap-2 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={actualizarEtapa}
                  onChange={(e) => setActualizarEtapa(e.target.checked)}
                  disabled={!etapaSugerida}
                />
                Actualizar etapa de la causa
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={subirADrive && hasRealDriveFolder}
                  disabled={!hasRealDriveFolder}
                  onChange={(e) => setSubirADrive(e.target.checked)}
                />
                Subir a carpeta Google Drive
                {!hasRealDriveFolder && (
                  <span className="text-xs text-[var(--ink-soft)]/55">
                    (requiere carpeta real, no stub)
                  </span>
                )}
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={confidencial}
                  onChange={(e) => setConfidencial(e.target.checked)}
                />
                Marcar confidencial
              </label>
            </div>
          </div>
          <div className="rounded-2xl border border-[var(--line)] bg-white/70 p-4 text-sm">
            <div className="font-medium">Vista previa del handoff</div>
            <ul className="mt-2 space-y-1 text-[var(--ink-soft)]/80">
              <li>
                · {TIPOS_MINUTA.find((t) => t.value === tipo)?.label}: {titulo}
              </li>
              <li>· Resumen: {resumenEjecutivo.slice(0, 140) || "—"}…</li>
              <li>
                · Acciones:{" "}
                {acciones.filter((a) => a.descripcion.trim()).length || 0}
              </li>
            </ul>
          </div>
          {error && (
            <p
              className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              role="alert"
              aria-live="assertive"
            >
              {error}
            </p>
          )}
        </section>
      )}

      {error && step !== 3 && (
        <p
          className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
          aria-live="assertive"
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap justify-between gap-3">
        <button
          type="button"
          className="btn btn-ghost"
          disabled={step === 0 || pending}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          Atrás
        </button>
        {step < steps.length - 1 ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canNext() || pending}
            onClick={() => setStep((s) => s + 1)}
          >
            Continuar
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canNext() || pending}
            onClick={submit}
          >
            {pending ? "Guardando…" : "Generar minuta"}
          </button>
        )}
      </div>
    </div>
  );
}
