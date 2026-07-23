"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ModuleHeader } from "@/components/sites/SiteNav";

type Results = {
  q: string;
  sites: Array<{ id: string; name: string; tipo: string }>;
  causas: Array<{ id: string; titulo: string; rit: string | null }>;
  files: Array<{ id: string; name: string; site: { id: string; name: string } }>;
  tasks: Array<{ id: string; title: string; site: { id: string; name: string } | null }>;
  jurisprudencia: Array<{ id: string; rol: string; caratula: string | null }>;
  wiki: Array<{ id: string; title: string; site: { id: string; name: string } }>;
};

export default function SearchPage() {
  const [results, setResults] = useState<Results | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = String(new FormData(e.currentTarget).get("q") || "").trim();
    if (!q) return;
    setBusy(true);
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    setResults(await res.json());
    setBusy(false);
  }

  return (
    <div>
      <ModuleHeader
        eyebrow="Enterprise search"
        title="Buscar"
        subtitle="Sites, causas, files, tasks, wiki y jurisprudencia en un solo índice."
      />
      <form onSubmit={onSubmit} className="panel mb-6 flex gap-2 rounded-3xl p-4">
        <input className="input" name="q" placeholder="Ej. tutela, Andes, Demanda, C-4521…" required />
        <button className="btn btn-primary" disabled={busy} type="submit">
          {busy ? "…" : "Buscar"}
        </button>
      </form>

      {results && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ResultBlock title="Sites" items={results.sites.map((s) => ({ href: `/sites/${s.id}`, label: s.name, meta: s.tipo }))} />
          <ResultBlock title="Causas" items={results.causas.map((c) => ({ href: `/causas/${c.id}`, label: c.titulo, meta: c.rit || "" }))} />
          <ResultBlock title="Files" items={results.files.map((f) => ({ href: `/sites/${f.site.id}/archivos`, label: f.name, meta: f.site.name }))} />
          <ResultBlock title="Tasks" items={results.tasks.map((t) => ({ href: t.site ? `/sites/${t.site.id}/tareas` : "/tareas", label: t.title, meta: t.site?.name || "" }))} />
          <ResultBlock title="Wiki" items={results.wiki.map((w) => ({ href: `/sites/${w.site.id}/wiki`, label: w.title, meta: w.site.name }))} />
          <ResultBlock title="Jurisprudencia" items={results.jurisprudencia.map((j) => ({ href: `/jurisprudencia?q=${encodeURIComponent(j.rol)}`, label: j.caratula || j.rol, meta: j.rol }))} />
        </div>
      )}
    </div>
  );
}

function ResultBlock({
  title,
  items,
}: {
  title: string;
  items: Array<{ href: string; label: string; meta: string }>;
}) {
  return (
    <section className="panel rounded-3xl p-5">
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-3 space-y-2">
        {items.length === 0 && <p className="text-sm text-[var(--ink-soft)]/60">Sin resultados</p>}
        {items.map((i) => (
          <Link key={i.href + i.label} href={i.href} className="block rounded-xl border border-[var(--line)] px-3 py-2 text-sm hover:border-[var(--sea)]/40">
            <div className="font-medium">{i.label}</div>
            <div className="text-xs text-[var(--ink-soft)]/65">{i.meta}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
