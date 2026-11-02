"use client";

import { FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function SearchInner({
  materias,
}: {
  materias: Array<{ value: string; label: string }>;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    const q = String(fd.get("q") || "").trim();
    const materia = String(fd.get("materia") || "").trim();
    if (q) params.set("q", q);
    if (materia) params.set("materia", materia);
    router.push(`/jurisprudencia?${params.toString()}`);
  }

  return (
    <form onSubmit={onSubmit} className="panel grid grid-cols-1 items-end gap-3 rounded-3xl p-4 sm:grid-cols-2 lg:grid-cols-[1fr_220px_auto]">
      <div className="min-w-0 sm:col-span-2 lg:col-span-1">
        <label htmlFor="jurisprudencia-query" className="mb-2 block text-sm font-medium">Rol, doctrina o carátula</label>
        <input
          id="jurisprudencia-query"
          className="input w-full"
          name="q"
          placeholder="Buscar por rol, doctrina, carátula, tags…"
          defaultValue={sp.get("q") || ""}
        />
      </div>
      <div className="min-w-0">
        <label htmlFor="jurisprudencia-materia" className="mb-2 block text-sm font-medium">Materia</label>
        <select id="jurisprudencia-materia" className="select w-full" name="materia" defaultValue={sp.get("materia") || ""}>
          <option value="">Todas las materias</option>
          {materias.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <button className="btn btn-secondary" type="submit">
        Buscar
      </button>
    </form>
  );
}

export function JurisprudenciaSearch({
  materias,
}: {
  materias: Array<{ value: string; label: string }>;
}) {
  return (
    <Suspense fallback={<div className="panel h-16 rounded-3xl" />}>
      <SearchInner materias={materias} />
    </Suspense>
  );
}
