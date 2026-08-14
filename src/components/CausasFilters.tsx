"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { MATERIAS, ESTADOS_CAUSA } from "@/lib/chile";
import { FormEvent, Suspense } from "react";

function FiltersInner({ defaultEstado }: { defaultEstado: string }) {
  const router = useRouter();
  const sp = useSearchParams();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    for (const key of ["q", "materia", "estado"]) {
      const v = String(fd.get(key) || "").trim();
      if (v) params.set(key, v);
    }
    router.push(`/causas?${params.toString()}`);
  }

  const estadoValue = sp.get("estado") || defaultEstado || "activa";

  return (
    <form
      onSubmit={onSubmit}
      className="panel grid grid-cols-1 gap-3 rounded-3xl p-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      <input
        className="input sm:col-span-2"
        name="q"
        placeholder="Buscar RIT, carátula, tribunal…"
        defaultValue={sp.get("q") || ""}
      />
      <select
        className="select"
        name="materia"
        defaultValue={sp.get("materia") || ""}
      >
        <option value="">Todas las materias</option>
        {MATERIAS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <select className="select" name="estado" defaultValue={estadoValue}>
          <option value="all">Todos los estados</option>
          {ESTADOS_CAUSA.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <button className="btn btn-secondary shrink-0" type="submit">
          Filtrar
        </button>
      </div>
    </form>
  );
}

export function CausasFilters({
  defaultEstado = "activa",
}: {
  defaultEstado?: string;
}) {
  return (
    <Suspense fallback={<div className="panel h-16 rounded-3xl" />}>
      <FiltersInner defaultEstado={defaultEstado} />
    </Suspense>
  );
}
