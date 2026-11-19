"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiMutation } from "@/lib/api-mutation";
import { labelDiasRestantes, labelUrgencia, MAX_DIAS_PLAZO } from "@/lib/plazos";
import { createSubmissionKeys } from "@/lib/client-submission-key";

import { DeadlineOptions } from "./DeadlineOptions";

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
  civilAvailable,
  chile,
}: {
  causas: Option[];
  responsables: Option[];
  defaults?: PlazoFormDefaults;
  civilAvailable: boolean;
  chile: boolean;
}) {
  const router = useRouter();
  const fieldId = useId();
  const [profile, setProfile] = useState<"manual" | "internal" | "civil">("manual");
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
      if (profile !== "internal" || !fechaNotificacion || !diasPlazo || Number(diasPlazo) < 1) {
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
  }, [profile, fechaNotificacion, diasPlazo, tipoComputo]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const payload = {
      titulo: String(fd.get("titulo") || ""),
      descripcion: String(fd.get("descripcion") || ""),
      calculationProfile: profile,
      fechaLimite: profile === "manual" ? fechaLimite : null,
      fechaNotificacion: fechaNotificacion || null,
      diasPlazo: profile !== "manual" && diasPlazo ? Number(diasPlazo) : null,
      ...(profile === "civil" ? {
        civilScopeConfirmed: fd.get("civilScopeConfirmed") === "on",
        notificationConfirmed: fd.get("notificationConfirmed") === "on",
      } : { tipoComputo }),
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
    setProfile("manual");
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
        <DeadlineOptions label="Causa" name="causaId" initial={causas} value={causaId} onChange={setCausaId}/>
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
      <div className="sm:col-span-2">
        <label htmlFor={`${fieldId}-profile`} className="mb-2 block text-sm font-medium">Cómo fijar el vencimiento</label>
        <select id={`${fieldId}-profile`} className="select" value={profile} onChange={e => {
          const next = e.target.value;
          if (next !== "manual" && next !== "internal" && next !== "civil") return;
          setProfile(next);
          setEstimate(null);
          setError("");
        }}>
          <option value="manual">Fecha revisada por el estudio</option>
          {chile && <option value="internal">Estimación interna de Chile</option>}
          {chile && <option value="civil">CPC chileno · término individual en días</option>}
        </select>
      </div>
      {profile === "civil" && (civilAvailable ? (
        <fieldset className="space-y-2 text-sm sm:col-span-2 lg:col-span-4">
          <legend className="font-medium">Ámbito del perfil civil</legend>
          <label className="flex gap-2"><input type="checkbox" name="notificationConfirmed" required />Verifiqué la fecha efectiva de notificación para esta parte.</label>
          <label className="flex gap-2"><input type="checkbox" name="civilScopeConfirmed" required />Es un término legal individual del CPC en días. Descarté procedimiento especial, suspensión, ampliación territorial, habilitación judicial y feriados regionales aplicables.</label>
        </fieldset>
      ) : (
        <p role="status" className="text-sm sm:col-span-2">El perfil espera revisión profesional. Para registrar el plazo, elija «Fecha revisada por el estudio».</p>
      ))}
      <div>
        <label htmlFor={`${fieldId}-fechaNotificacion`} className="mb-2 block text-sm font-medium">Notificación</label>
        <input id={`${fieldId}-fechaNotificacion`}
          className="input"
          type="date"
          required={profile !== "manual"}
          name="fechaNotificacion"
          value={fechaNotificacion}
          onChange={(e) => { setEstimate(null); setFechaNotificacion(e.target.value); }}
        />
      </div>
      {profile !== "manual" && <div>
        <label htmlFor={`${fieldId}-diasPlazo`} className="mb-2 block text-sm font-medium">Días plazo</label>
        <input id={`${fieldId}-diasPlazo`}
          className="input"
          type="number"
          min="1"
          max={MAX_DIAS_PLAZO}
          required
          name="diasPlazo"
          placeholder="5"
          value={diasPlazo}
          onChange={(e) => { setEstimate(null); setDiasPlazo(e.target.value); }}
        />
      </div>}
      {profile === "internal" && <div>
        <label htmlFor={`${fieldId}-tipoComputo`} className="mb-2 block text-sm font-medium">Cómputo</label>
        <select id={`${fieldId}-tipoComputo`}
          className="select"
          name="tipoComputo"
          value={tipoComputo}
          onChange={(e) => {
            setEstimate(null);
            setTipoComputo(e.target.value === "corridos" ? "corridos" : "habiles");
          }}
        >
          <option value="habiles">Hábiles (lun–vie)</option>
          <option value="corridos">Corridos</option>
        </select>
      </div>}
      {profile === "manual" && <div>
        <label htmlFor={`${fieldId}-fechaLimite`} className="mb-2 block text-sm font-medium">
          Fecha límite directa
        </label>
        <input id={`${fieldId}-fechaLimite`}
          className="input"
          type="date"
          name="fechaLimite"
          required
          value={fechaLimite}
          onChange={(e) => setFechaLimite(e.target.value)}
        />
      </div>}
      <div>
        <label htmlFor={`${fieldId}-tipo`} className="mb-2 block text-sm font-medium">Tipo</label>
        <select id={`${fieldId}-tipo`} className="select" key={profile === "civil" ? "civil" : "other"} name="tipo" defaultValue="procesal" disabled={profile === "civil"}>
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
        <button className="btn btn-primary w-full" disabled={busy || (profile === "civil" && !civilAvailable)} type="submit">
          {busy ? "Guardando..." : "Crear plazo"}
        </button>
      </div>
      {profile === "internal" && <p className="text-xs leading-relaxed text-[var(--muted)] sm:col-span-2 lg:col-span-4">
        La estimación interna usa días hábiles de lunes a viernes y feriados nacionales. En días corridos, traslada el vencimiento al siguiente hábil si corresponde.
      </p>}
      {profile === "internal" && estimate && !estimate.error && estimate.vencimiento && (
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
            onClick={() => { setFechaLimite(estimate.vencimiento || ""); setProfile("manual"); }}
          >
            Usar esta fecha
          </button>
        </div>
      )}
      {profile === "internal" && estimate?.error && (
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
