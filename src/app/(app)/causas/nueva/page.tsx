"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/sites/SiteNav";
import {
  MATERIAS,
  ETAPAS,
  TRIBUNALES_CHILE,
  validarRit,
  validarRuc,
  validarRut,
} from "@/lib/chile";
import { apiMutation } from "@/lib/api-mutation";
import { CausaExtraerAi } from "@/components/ai/CausaExtraerAi";

type ConflictHit = {
  causaId: string;
  titulo: string;
  rit: string | null;
  match: string;
  severity: "warning" | "blocked";
};

function NuevaCausaInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clienteIdFromQuery = searchParams.get("clienteId") || "";
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictHit[]>([]);
  const [conflictStatus, setConflictStatus] = useState<"idle" | "clear" | "warning" | "blocked">("idle");
  const [overrideRequired, setOverrideRequired] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const rit = String(fd.get("rit") || "");
    const ruc = String(fd.get("ruc") || "");
    const partes = [
      {
        nombre: String(fd.get("demandante") || ""),
        rut: String(fd.get("demandanteRut") || ""),
        rol: "demandante",
      },
      {
        nombre: String(fd.get("demandado") || ""),
        rut: String(fd.get("demandadoRut") || ""),
        rol: "demandado",
      },
    ].filter((p) => p.nombre);
    if (rit && !validarRit(rit)) {
      setError("RIT inválido. Use formatos como C-1234-2026.");
      setLoading(false);
      return;
    }
    if (ruc && !validarRuc(ruc)) {
      setError("RUC inválido. Use cuerpo numérico con dígito verificador.");
      setLoading(false);
      return;
    }
    for (const parte of partes) {
      if (parte.rut && !validarRut(parte.rut)) {
        setError(`RUT inválido para ${parte.nombre}.`);
        setLoading(false);
        return;
      }
    }

    const preflight = await fetch("/api/conflict-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partes }),
    });
    if (preflight.ok) {
      const result = (await preflight.json()) as { conflicts: ConflictHit[] };
      setConflicts(result.conflicts);
      const hasBlocked = result.conflicts.some((c) => c.severity === "blocked");
      setConflictStatus(hasBlocked ? "blocked" : result.conflicts.length ? "warning" : "clear");
      if (hasBlocked && !fd.get("conflictOverride")) {
        setOverrideRequired(true);
        setError("Se detectó un conflicto bloqueante. Revise y confirme override con notas.");
        setLoading(false);
        return;
      }
    }

    const payload = {
      titulo: String(fd.get("titulo")),
      rit,
      ruc,
      tribunal: String(fd.get("tribunal")),
      materia: String(fd.get("materia")),
      procedimiento: String(fd.get("procedimiento") || ""),
      etapa: String(fd.get("etapa")),
      caratula: String(fd.get("caratula") || ""),
      resumen: String(fd.get("resumen") || ""),
      clienteId: clienteIdFromQuery || null,
      conflictOverride: fd.get("conflictOverride") === "on",
      conflictNotes: String(fd.get("conflictNotes") || ""),
      partes,
    };

    const result = await apiMutation<{
      id?: string;
      conflicts?: ConflictHit[];
      error?: string;
    }>("/api/causas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setLoading(false);
    if (!result.ok) {
      if (result.status === 409) {
        setConflictStatus("blocked");
        setOverrideRequired(true);
        setError(result.error || "Conflicto de interés detectado");
        return;
      }
      setError("No se pudo crear la causa");
      return;
    }
    const causa = result.data;
    if (causa.id) router.push(`/causas/${causa.id}`);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader eyebrow="Alta de litigio" title="Nueva causa" />

      <form id="nueva-causa-form" onSubmit={onSubmit} className="panel space-y-4 rounded-3xl p-6">
        <CausaExtraerAi formId="nueva-causa-form" />
        <div>
          <label className="mb-1 block text-sm font-medium">Título</label>
          <input className="input" name="titulo" required placeholder="Ej. Cobro de pesos — contrato" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">RIT</label>
            <input className="input" name="rit" placeholder="C-1234-2026" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">RUC</label>
            <input className="input" name="ruc" placeholder="2500123456-7" />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Tribunal</label>
          <input
            className="input"
            name="tribunal"
            required
            list="tribunales-chile"
            placeholder="Escriba o elija el tribunal (como en OJV)"
            defaultValue=""
            autoComplete="off"
          />
          <datalist id="tribunales-chile">
            {TRIBUNALES_CHILE.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <p className="mt-1 text-xs text-[var(--ink-soft)]/60">
            Puede escribir cualquier nombre de tribunal (no solo la lista).
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Materia</label>
            <select className="select" name="materia" defaultValue="civil">
              {MATERIAS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Etapa</label>
            <select className="select" name="etapa" defaultValue="ingreso">
              {ETAPAS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Procedimiento</label>
          <input className="input" name="procedimiento" placeholder="Ordinario, monitorio, protección…" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Carátula</label>
          <input className="input" name="caratula" placeholder="A con B" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Demandante / recurrente</label>
            <input className="input" name="demandante" />
            <input className="input mt-2" name="demandanteRut" placeholder="RUT parte" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Demandado / recorrido</label>
            <input className="input" name="demandado" />
            <input className="input mt-2" name="demandadoRut" placeholder="RUT parte" />
          </div>
        </div>
        {conflictStatus !== "idle" && (
          <div className="rounded-2xl border border-[var(--line)] bg-white/70 p-4 text-sm">
            <div className="font-semibold">
              Conflictos:{" "}
              {conflictStatus === "clear"
                ? "sin hallazgos"
                : conflictStatus === "blocked"
                  ? "bloqueante"
                  : "advertencias"}
            </div>
            {conflicts.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--ink-soft)]/80">
                {conflicts.map((c) => (
                  <li key={`${c.causaId}-${c.match}`}>
                    {c.match} ({c.severity})
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {overrideRequired && (
          <div className="rounded-2xl border border-[var(--danger)]/30 bg-red-50 p-4">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" name="conflictOverride" /> Autorizar override de conflicto
            </label>
            <textarea
              className="textarea mt-3"
              name="conflictNotes"
              required={overrideRequired}
              placeholder="Fundamento del override y aprobación interna"
            />
          </div>
        )}
        <div>
          <label className="mb-1 block text-sm font-medium">Resumen</label>
          <textarea className="textarea" name="resumen" />
        </div>
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        <button className="btn btn-primary" disabled={loading} type="submit">
          {loading ? "Guardando…" : "Crear causa"}
        </button>
      </form>
    </div>
  );
}

export default function NuevaCausaPage() {
  return (
    <Suspense fallback={<div className="panel h-40 animate-pulse rounded-3xl" />}>
      <NuevaCausaInner />
    </Suspense>
  );
}
