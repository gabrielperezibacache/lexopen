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
    <form onSubmit={onSubmit} className="panel grid gap-3 rounded-3xl p-4 md:grid-cols-[1fr_220px_auto]">
      <input
        className="input"
        name="q"
        placeholder="Buscar por rol, doctrina, carátula, tags…"
        defaultValue={sp.get("q") || ""}
      />
      <select className="select" name="materia" defaultValue={sp.get("materia") || ""}>
        <option value="">Todas las materias</option>
        {materias.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
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
