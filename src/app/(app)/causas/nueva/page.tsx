"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  MATERIAS,
  ETAPAS,
  TRIBUNALES_CHILE,
  validarRit,
  validarRuc,
  validarRut,
} from "@/lib/chile";
import { AiAssist, type AiActionResponse } from "@/components/ai/AiAssist";

type ConflictHit = {
  causaId: string;
  titulo: string;
  rit: string | null;
  match: string;
  severity: "warning" | "blocked";
};

type ClienteOption = { id: string; razonSocial: string; rut: string | null };

const MATERIA_VALUES = new Set(MATERIAS.map((m) => m.value));

function NuevaCausaForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictHit[]>([]);
  const [conflictStatus, setConflictStatus] = useState<"idle" | "clear" | "warning" | "blocked">("idle");
  const [overrideRequired, setOverrideRequired] = useState(false);
  const [clientes, setClientes] = useState<ClienteOption[]>([]);
  const [clienteId, setClienteId] = useState(sp.get("clienteId") || "");
  const [titulo, setTitulo] = useState("");
  const [rit, setRit] = useState("");
  const [ruc, setRuc] = useState("");
  const [tribunal, setTribunal] = useState(TRIBUNALES_CHILE[0] || "");
  const [materia, setMateria] = useState("civil");
  const [etapa, setEtapa] = useState("ingreso");
  const [procedimiento, setProcedimiento] = useState("");
  const [caratula, setCaratula] = useState("");
  const [resumen, setResumen] = useState("");
  const [demandante, setDemandante] = useState("");
  const [demandanteRut, setDemandanteRut] = useState("");
  const [demandado, setDemandado] = useState("");
  const [demandadoRut, setDemandadoRut] = useState("");
  const [pasteText, setPasteText] = useState("");

  useEffect(() => {
    fetch("/api/clientes")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ClienteOption[]) => setClientes(data))
      .catch(() => setClientes([]));
  }, []);

  function applyExtract(result: AiActionResponse) {
    const data = result.data as {
      titulo?: string;
      rit?: string | null;
      ruc?: string | null;
      tribunal?: string;
      materia?: string;
      caratula?: string;
      resumen?: string;
      partes?: Array<{ nombre?: string; rut?: string | null; rol?: string }>;
    } | null;
    if (!data) {
      setError("La IA no pudo extraer campos estructurados.");
      return;
    }
    if (data.titulo) setTitulo(data.titulo);
    if (data.rit) setRit(data.rit);
    if (data.ruc) setRuc(data.ruc);
    if (data.tribunal) {
      const match = TRIBUNALES_CHILE.find(
        (t) => t.toLowerCase() === data.tribunal!.toLowerCase()
      );
      setTribunal(match || data.tribunal);
    }
    if (data.materia && MATERIA_VALUES.has(data.materia)) setMateria(data.materia);
    if (data.caratula) setCaratula(data.caratula);
    if (data.resumen) setResumen(data.resumen);
    const dem =
      data.partes?.find((p) => /demandante|recurrente/i.test(p.rol || "")) ||
      data.partes?.[0];
    const dado =
      data.partes?.find((p) => /demandado|recorrido/i.test(p.rol || "")) ||
      data.partes?.[1];
    if (dem?.nombre) setDemandante(dem.nombre);
    if (dem?.rut) setDemandanteRut(dem.rut);
    if (dado?.nombre) setDemandado(dado.nombre);
    if (dado?.rut) setDemandadoRut(dado.rut);
    setError("");
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const partes = [
      {
        nombre: demandante,
        rut: demandanteRut,
        rol: "demandante",
      },
      {
        nombre: demandado,
        rut: demandadoRut,
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
      titulo,
      rit,
      ruc,
      tribunal,
      materia,
      procedimiento,
      etapa,
      caratula,
      resumen,
      clienteId: clienteId || null,
      conflictOverride: fd.get("conflictOverride") === "on",
      conflictNotes: String(fd.get("conflictNotes") || ""),
      partes,
    };

    const res = await fetch("/api/causas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setLoading(false);
    if (!res.ok) {
      if (res.status === 409) {
        const body = (await res.json()) as { conflicts?: ConflictHit[]; error?: string };
        setConflicts(body.conflicts || []);
        setConflictStatus("blocked");
        setOverrideRequired(true);
        setError(body.error || "Conflicto de interés detectado");
        return;
      }
      setError("No se pudo crear la causa");
      return;
    }
    const causa = await res.json();
    router.push(`/causas/${causa.id}`);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--sea)]">
          Alta de litigio
        </p>
        <h1 className="display mt-2 text-4xl">Nueva causa</h1>
      </div>

      <form onSubmit={onSubmit} className="panel space-y-4 rounded-3xl p-6">
        <div className="rounded-2xl border border-dashed border-[var(--line)] p-3">
          <label className="mb-1 block text-sm font-medium">
            Pegar resolución / carátula (opcional)
          </label>
          <textarea
            className="textarea min-h-[96px]"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Pegue texto del proveído o carátula para autocompletar con IA…"
          />
          <div className="mt-2">
            <AiAssist
              action="causa.extraer"
              label="Extraer campos con IA"
              showPreview={false}
              prompt={pasteText}
              extra={{ texto: pasteText }}
              onResult={applyExtract}
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Cliente</label>
          <select
            className="select"
            name="clienteId"
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}
          >
            <option value="">Sin cliente asignado</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.razonSocial}
                {c.rut ? ` · ${c.rut}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Título</label>
          <input
            className="input"
            name="titulo"
            required
            placeholder="Ej. Cobro de pesos — contrato"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">RIT</label>
            <input
              className="input"
              name="rit"
              placeholder="C-1234-2026"
              value={rit}
              onChange={(e) => setRit(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">RUC</label>
            <input
              className="input"
              name="ruc"
              placeholder="2500123456-7"
              value={ruc}
              onChange={(e) => setRuc(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Tribunal</label>
          <select
            className="select"
            name="tribunal"
            required
            value={tribunal}
            onChange={(e) => setTribunal(e.target.value)}
          >
            {!TRIBUNALES_CHILE.includes(tribunal) && tribunal && (
              <option value={tribunal}>{tribunal}</option>
            )}
            {TRIBUNALES_CHILE.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Materia</label>
            <select
              className="select"
              name="materia"
              value={materia}
              onChange={(e) => setMateria(e.target.value)}
            >
              {MATERIAS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Etapa</label>
            <select
              className="select"
              name="etapa"
              value={etapa}
              onChange={(e) => setEtapa(e.target.value)}
            >
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
          <input
            className="input"
            name="procedimiento"
            placeholder="Ordinario, monitorio, protección…"
            value={procedimiento}
            onChange={(e) => setProcedimiento(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Carátula</label>
          <input
            className="input"
            name="caratula"
            placeholder="A con B"
            value={caratula}
            onChange={(e) => setCaratula(e.target.value)}
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Demandante / recurrente</label>
            <input
              className="input"
              name="demandante"
              value={demandante}
              onChange={(e) => setDemandante(e.target.value)}
            />
            <input
              className="input mt-2"
              name="demandanteRut"
              placeholder="RUT parte"
              value={demandanteRut}
              onChange={(e) => setDemandanteRut(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Demandado / recorrido</label>
            <input
              className="input"
              name="demandado"
              value={demandado}
              onChange={(e) => setDemandado(e.target.value)}
            />
            <input
              className="input mt-2"
              name="demandadoRut"
              placeholder="RUT parte"
              value={demandadoRut}
              onChange={(e) => setDemandadoRut(e.target.value)}
            />
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
          <textarea
            className="textarea"
            name="resumen"
            value={resumen}
            onChange={(e) => setResumen(e.target.value)}
          />
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
    <Suspense fallback={<div className="p-6 text-sm">Cargando…</div>}>
      <NuevaCausaForm />
    </Suspense>
  );
}
