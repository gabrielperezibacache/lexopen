"use client";

import { FormEvent, Suspense, useId, useState } from "react";
import Link from "next/link";
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
  const fieldId = useId();
  const router = useRouter();
  const searchParams = useSearchParams();
  const clienteIdFromQuery = searchParams.get("clienteId") || "";
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictHit[]>([]);
  const [restrictedMatch, setRestrictedMatch] = useState(false);
  const [coverageLimited, setCoverageLimited] = useState(false);
  const [conflictStatus, setConflictStatus] = useState<"idle" | "clear" | "warning" | "blocked">("idle");
  const [overrideRequired, setOverrideRequired] = useState(false);
  const [duplicateId, setDuplicateId] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setDuplicateId(null);
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

    const preflight = await apiMutation<{ conflicts: ConflictHit[]; status: "clear" | "warning" | "blocked"; hasRestrictedMatch?: boolean; coverageLimited?: boolean }>(
      "/api/conflict-check",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partes }),
      }
    );
    if (preflight.ok) {
      const result = preflight.data;
      setConflicts(result.conflicts || []);
      const hasBlocked = result.status === "blocked";
      setRestrictedMatch(Boolean(result.hasRestrictedMatch));
      setCoverageLimited(Boolean(result.coverageLimited));
      setConflictStatus(result.status);
      if (result.hasRestrictedMatch && hasBlocked) {
        setError("Coincidencia reservada: requiere revisión de un socio autorizado");
        setOverrideRequired(false);
        setLoading(false);
        return;
      }
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
      existingId?: string;
      code?: string;
      conflicts?: ConflictHit[];
      error?: string;
    }>("/api/causas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setLoading(false);
    if (!result.ok) {
      if (result.status === 409 && result.data?.code === "causa_duplicate") {
        const existingId = result.data.existingId || result.data.id;
        setError(
          existingId
            ? `${result.error || "Ya existe una causa con ese RIT o RUC en el tribunal"}.`
            : result.error || "Ya existe una causa duplicada"
        );
        if (existingId) {
          setDuplicateId(existingId);
        }
        return;
      }
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
      <PageHeader
        eyebrow="Alta de litigio"
        title="Nueva causa"
        actions={<Link href="/causas" className="btn btn-ghost">Volver a causas</Link>}
      />

      <form id="nueva-causa-form" onSubmit={onSubmit} className="panel space-y-4 rounded-[var(--radius-lg)] p-6">
        <CausaExtraerAi formId="nueva-causa-form" />
        <h2 className="text-lg font-semibold">Identificación de la causa</h2>
        <div>
          <label htmlFor={`${fieldId}-titulo`} className="mb-2 block text-sm font-medium">Título</label>
          <input id={`${fieldId}-titulo`} className="input" name="titulo" required placeholder="Ej. Cobro de pesos — contrato" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${fieldId}-rit`} className="mb-2 block text-sm font-medium">RIT</label>
            <input id={`${fieldId}-rit`} className="input" name="rit" placeholder="C-1234-2026" />
          </div>
          <div>
            <label htmlFor={`${fieldId}-ruc`} className="mb-2 block text-sm font-medium">RUC</label>
            <input id={`${fieldId}-ruc`} className="input" name="ruc" placeholder="2500123456-7" />
          </div>
        </div>
        <div>
          <label htmlFor={`${fieldId}-tribunal`} className="mb-2 block text-sm font-medium">Tribunal</label>
          <input id={`${fieldId}-tribunal`}
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
          <p className="mt-1 text-xs text-[var(--muted)]">
            Puede escribir cualquier nombre de tribunal (no solo la lista).
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor={`${fieldId}-materia`} className="mb-2 block text-sm font-medium">Materia</label>
            <select id={`${fieldId}-materia`} className="select" name="materia" defaultValue="civil">
              {MATERIAS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${fieldId}-etapa`} className="mb-2 block text-sm font-medium">Etapa</label>
            <select id={`${fieldId}-etapa`} className="select" name="etapa" defaultValue="ingreso">
              {ETAPAS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor={`${fieldId}-procedimiento`} className="mb-2 block text-sm font-medium">Procedimiento</label>
          <input id={`${fieldId}-procedimiento`} className="input" name="procedimiento" placeholder="Ordinario, monitorio, protección…" />
        </div>
        <div>
          <label htmlFor={`${fieldId}-caratula`} className="mb-2 block text-sm font-medium">Carátula</label>
          <input id={`${fieldId}-caratula`} className="input" name="caratula" placeholder="A con B" />
        </div>
        <h2 className="border-t border-[var(--line)] pt-5 text-lg font-semibold">Partes</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor={`${fieldId}-demandante`} className="mb-2 block text-sm font-medium">Demandante / recurrente</label>
            <input id={`${fieldId}-demandante`} className="input" name="demandante" />
            <label className="mt-3 block space-y-2 text-sm font-medium">
              <span>RUT parte</span>
              <input className="input" name="demandanteRut" placeholder="RUT parte" />
            </label>
          </div>
          <div>
            <label htmlFor={`${fieldId}-demandado`} className="mb-2 block text-sm font-medium">Demandado / recorrido</label>
            <input id={`${fieldId}-demandado`} className="input" name="demandado" />
            <label className="mt-3 block space-y-2 text-sm font-medium">
              <span>RUT parte</span>
              <input className="input" name="demandadoRut" placeholder="RUT parte" />
            </label>
          </div>
        </div>
        {conflictStatus !== "idle" && (
          <div className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-solid)] p-4 text-sm">
            <div className="font-semibold">
              Conflictos:{" "}
              {conflictStatus === "clear"
                ? "sin hallazgos"
                : conflictStatus === "blocked"
                  ? "bloqueante"
                  : "advertencias"}
            </div>
            {restrictedMatch && <p className="mt-2" role="alert">Coincidencia reservada: requiere revisión de un socio autorizado</p>}
            {coverageLimited && <p className="mt-2">La revisión alcanzó su límite de cobertura. No confirma ausencia de otros conflictos.</p>}
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
          <div className="rounded-[var(--radius-md)] border border-[var(--danger)]/30 bg-red-50 p-4">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" name="conflictOverride" /> Autorizar override de conflicto
            </label>
            <label className="mt-4 block space-y-2 text-sm font-medium">
              <span>Fundamento del override y aprobación interna</span>
            <textarea
              className="textarea"
              name="conflictNotes"
              required={overrideRequired}
              placeholder="Fundamento del override y aprobación interna"
            />
            </label>
          </div>
        )}
        <div>
          <label htmlFor={`${fieldId}-resumen`} className="mb-2 block text-sm font-medium">Resumen</label>
          <textarea id={`${fieldId}-resumen`} className="textarea" name="resumen" />
        </div>
        {error && (
          <p className="text-sm text-[var(--danger)]" role="alert">
            {error}
            {duplicateId ? (
              <>
                {" "}
                <Link href={`/causas/${duplicateId}`} className="underline">
                  Abrir ficha existente
                </Link>
              </>
            ) : null}
          </p>
        )}
        <button className="btn btn-primary" disabled={loading} type="submit">
          {loading ? "Guardando…" : "Crear causa"}
        </button>
      </form>
    </div>
  );
}

export default function NuevaCausaPage() {
  return (
    <Suspense fallback={<div className="panel h-40 animate-pulse rounded-[var(--radius-lg)]" />}>
      <NuevaCausaInner />
    </Suspense>
  );
}
