"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";
import { labelDiasRestantes, labelUrgencia, MAX_DIAS_PLAZO } from "@/lib/plazos";
import { createSubmissionKeys } from "@/lib/client-submission-key";

type Option = { id: string; label: string };

export type PlazoFormDefaults = {
  causaId?: string;
  fechaNotificacion?: string;
  diasPlazo?: string;
  tipoComputo?: "habiles" | "corridos";
  fechaLimite?: string;
  titulo?: string;
};

export function PlazoForm({
  causas,
  responsables,
  defaults,
}: {
  causas: Option[];
  responsables: Option[];
  defaults?: PlazoFormDefaults;
}) {
  const router = useRouter();
  const fieldId = useId();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submission = useRef(createSubmissionKeys(undefined, `lexopen:deadline:${defaults?.causaId || "global"}`));
  const [causaId, setCausaId] = useState(defaults?.causaId || "");
  const [fechaNotificacion, setFechaNotificacion] = useState(
    defaults?.fechaNotificacion || ""
  );
  const [diasPlazo, setDiasPlazo] = useState(defaults?.diasPlazo || "");
  const [tipoComputo, setTipoComputo] = useState<"habiles" | "corridos">(
    defaults?.tipoComputo === "corridos" ? "corridos" : "habiles"
  );
  const [fechaLimite, setFechaLimite] = useState(defaults?.fechaLimite || "");
  const [estimate, setEstimate] = useState<{
    vencimiento?: string;
    urgencia?: string;
    urgenciaLabel?: string;
    diasRestantes?: number;
    disclaimer?: string;
    error?: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(async () => {
      if (!fechaNotificacion || !diasPlazo || Number(diasPlazo) < 1) {
        if (!cancelled) setEstimate(null);
        return;
      }
      const result = await apiMutation<{
        vencimiento?: string;
        urgencia?: string;
        urgenciaLabel?: string;
        diasRestantes?: number;
        disclaimer?: string;
        error?: string;
      }>("/api/integrations/hermes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "estimate-plazo",
          desde: fechaNotificacion,
          dias: Number(diasPlazo),
          tipoComputo,
        }),
      });
      if (cancelled) return;
      setEstimate(result.ok ? result.data : { error: result.error || "No se pudo estimar" });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [fechaNotificacion, diasPlazo, tipoComputo]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const payload = {
      titulo: String(fd.get("titulo") || ""),
      descripcion: String(fd.get("descripcion") || ""),
      fechaLimite: fechaLimite || null,
      fechaNotificacion: fechaNotificacion || null,
      diasPlazo: diasPlazo ? Number(diasPlazo) : null,
      tipoComputo,
      esFatal: fd.get("esFatal") === "on",
      tipo: String(fd.get("tipo") || "procesal"),
      causaId: causaId || null,
      responsableId: String(fd.get("responsableId") || "") || null,
    };
    const result = await apiMutation("/api/plazos", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": submission.current.forPayload(payload) },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "No se pudo crear el plazo");
      return;
    }
    submission.current.complete(payload);
    form.reset();
    setCausaId("");
    setFechaNotificacion("");
    setDiasPlazo("");
    setTipoComputo("habiles");
    setFechaLimite("");
    setEstimate(null);
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="panel grid grid-cols-1 gap-4 rounded-[var(--radius-lg)] p-5 sm:grid-cols-2 lg:grid-cols-4"
    >
      <p className="text-sm text-[var(--muted)] sm:col-span-2 lg:col-span-4">El cálculo automático estima fechas internas para Chile y requiere revisar el régimen del procedimiento. Para otros países, indique una fecha límite revisada manualmente.</p>
      <div className="sm:col-span-2">
        <label htmlFor={`${fieldId}-titulo`} className="mb-2 block text-sm font-medium">Título</label>
        <input id={`${fieldId}-titulo`}
          className="input"
          name="titulo"
          required
          defaultValue={defaults?.titulo || ""}
          placeholder="Ej. Contestar demanda"
        />
      </div>
      <div>
        <label htmlFor={`${fieldId}-causaId`} className="mb-2 block text-sm font-medium">Causa</label>
        <select id={`${fieldId}-causaId`}
          className="select"
          name="causaId"
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
      <div>
        <label htmlFor={`${fieldId}-responsableId`} className="mb-2 block text-sm font-medium">Responsable</label>
        <select id={`${fieldId}-responsableId`} className="select" name="responsableId" defaultValue="">
          <option value="">Yo / por asignar</option>
          {responsables.map((u) => (
            <option key={u.id} value={u.id}>
              {u.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${fieldId}-fechaNotificacion`} className="mb-2 block text-sm font-medium">Notificación</label>
        <input id={`${fieldId}-fechaNotificacion`}
          className="input"
          type="date"
          name="fechaNotificacion"
          value={fechaNotificacion}
          onChange={(e) => setFechaNotificacion(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor={`${fieldId}-diasPlazo`} className="mb-2 block text-sm font-medium">Días plazo</label>
        <input id={`${fieldId}-diasPlazo`}
          className="input"
          type="number"
          min="1"
          max={MAX_DIAS_PLAZO}
          name="diasPlazo"
          placeholder="5"
          value={diasPlazo}
          onChange={(e) => setDiasPlazo(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor={`${fieldId}-tipoComputo`} className="mb-2 block text-sm font-medium">Cómputo</label>
        <select id={`${fieldId}-tipoComputo`}
          className="select"
          name="tipoComputo"
          value={tipoComputo}
          onChange={(e) =>
            setTipoComputo(
              e.target.value === "corridos" ? "corridos" : "habiles"
            )
          }
        >
          <option value="habiles">Hábiles (lun–vie)</option>
          <option value="corridos">Corridos</option>
        </select>
      </div>
      <div>
        <label htmlFor={`${fieldId}-fechaLimite`} className="mb-2 block text-sm font-medium">
          Fecha límite directa
        </label>
        <input id={`${fieldId}-fechaLimite`}
          className="input"
          type="date"
          name="fechaLimite"
          value={fechaLimite}
          onChange={(e) => setFechaLimite(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor={`${fieldId}-tipo`} className="mb-2 block text-sm font-medium">Tipo</label>
        <select id={`${fieldId}-tipo`} className="select" name="tipo" defaultValue="procesal">
          <option value="procesal">Procesal</option>
          <option value="interno">Interno</option>
          <option value="audiencia">Audiencia</option>
        </select>
      </div>
      <label className="flex items-end gap-2 pb-3 text-sm">
        <input type="checkbox" name="esFatal" /> Fatal
      </label>
      <div className="sm:col-span-2">
        <label htmlFor={`${fieldId}-descripcion`} className="mb-2 block text-sm font-medium">Descripción</label>
        <input id={`${fieldId}-descripcion`}
          className="input"
          name="descripcion"
          placeholder="Notas del cómputo"
        />
      </div>
      <div className="flex items-end">
        <button className="btn btn-primary w-full" disabled={busy} type="submit">
          {busy ? "Guardando..." : "Crear plazo"}
        </button>
      </div>
      <p className="text-xs leading-relaxed text-[var(--muted)] sm:col-span-2 lg:col-span-4">
        Hábiles: lunes a viernes, sin feriados nacionales (el sábado no se
        cuenta). Corridos: todos los días; si el último cae en sábado, domingo
        o feriado, el vencimiento pasa al día hábil siguiente. No descuenta la
        feria judicial de febrero.
      </p>
      {estimate && !estimate.error && estimate.vencimiento && (
        <div className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-solid)] px-4 py-3 text-sm sm:col-span-2 lg:col-span-4">
          <p>
            Estimación LexOpen: <strong>{estimate.vencimiento}</strong>
            {estimate.urgencia ? (
              <>
                {" "}
                ·{" "}
                <span className="font-medium">
                  {estimate.urgenciaLabel ||
                    labelUrgencia(
                      estimate.urgencia,
                      estimate.diasRestantes
                    )}
                </span>
              </>
            ) : null}
            {typeof estimate.diasRestantes === "number"
              ? ` · ${labelDiasRestantes(estimate.diasRestantes)}`
              : ""}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {estimate.disclaimer}
          </p>
          <button
            type="button"
            className="btn btn-ghost mt-2"
            onClick={() => setFechaLimite(estimate.vencimiento || "")}
          >
            Usar esta fecha
          </button>
        </div>
      )}
      {estimate?.error && (
        <p className="text-sm text-[var(--danger)] sm:col-span-2 lg:col-span-4">
          {estimate.error}
        </p>
      )}
      {error && (
        <p className="text-sm text-[var(--danger)] sm:col-span-2 lg:col-span-4">{error}</p>
      )}
    </form>
  );
}
