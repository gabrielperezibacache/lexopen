"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ModuleHeader } from "@/components/sites/SiteNav";

type Results = {
  q: string;
  sites: Array<{ id: string; name: string; tipo: string }>;
  causas: Array<{ id: string; titulo: string; rit: string | null }>;
  files: Array<{ id: string; name: string; site: { id: string; name: string } }>;
  documentos: Array<{
    id: string;
    nombre: string;
    tipo: string;
    ruta: string | null;
    causaId: string | null;
    causa: { id: string; rit: string | null; titulo: string } | null;
  }>;
  tasks: Array<{ id: string; title: string; site: { id: string; name: string } | null }>;
  jurisprudencia: Array<{ id: string; rol: string; caratula: string | null }>;
  wiki: Array<{ id: string; title: string; site: { id: string; name: string } }>;
  minutas: Array<{
    id: string;
    titulo: string;
    tipo: string;
    causaId: string;
    causa: { rit: string | null; titulo: string };
  }>;
};

const EXAMPLES = ["tutela", "Andes", "audiencia", "C-4521", "plazo"];

const EMPTY_RESULTS = (q: string): Results => ({
  q,
  sites: [],
  causas: [],
  files: [],
  documentos: [],
  tasks: [],
  jurisprudencia: [],
  wiki: [],
  minutas: [],
});

export default function SearchPage() {
  const [results, setResults] = useState<Results | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  async function runSearch(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    setBusy(true);
    setQuery(trimmed);
    setError("");
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResults(EMPTY_RESULTS(trimmed));
        setError(data.error || "No se pudo completar la búsqueda");
        return;
      }
      setResults({
        q: trimmed,
        sites: Array.isArray(data.sites) ? data.sites : [],
        causas: Array.isArray(data.causas) ? data.causas : [],
        files: Array.isArray(data.files) ? data.files : [],
        documentos: Array.isArray(data.documentos) ? data.documentos : [],
        tasks: Array.isArray(data.tasks) ? data.tasks : [],
        jurisprudencia: Array.isArray(data.jurisprudencia) ? data.jurisprudencia : [],
        wiki: Array.isArray(data.wiki) ? data.wiki : [],
        minutas: Array.isArray(data.minutas) ? data.minutas : [],
      });
    } catch {
      setResults(EMPTY_RESULTS(trimmed));
      setError("No se pudo completar la búsqueda");
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = String(new FormData(e.currentTarget).get("q") || "");
    await runSearch(q);
  }

  return (
    <div>
      <ModuleHeader
        eyebrow="Búsqueda unificada"
        title="Buscar"
        subtitle="Espacios, causas, documentos, minutas, archivos VDR, tareas, wiki y jurisprudencia en un solo índice."
      />
      <form onSubmit={onSubmit} className="panel mb-6 flex gap-2 rounded-3xl p-4">
        <input
          className="input"
          name="q"
          defaultValue={query}
          placeholder="Ej. tutela, Andes, audiencia, C-4521…"
          required
        />
        <button className="btn btn-primary" disabled={busy} type="submit">
          {busy ? "…" : "Buscar"}
        </button>
      </form>

      {error && (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}

      {!results && (
        <section className="panel rounded-3xl p-6">
          <h2 className="font-semibold">Empiece a buscar</h2>
          <p className="mt-2 text-sm text-[var(--ink-soft)]/75">
            Pruebe con un RIT, cliente, palabra de minuta o término de jurisprudencia.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                className="btn btn-ghost"
                onClick={() => runSearch(ex)}
              >
                {ex}
              </button>
            ))}
          </div>
        </section>
      )}

      {results && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ResultBlock
            title="Espacios"
            items={results.sites.map((s) => ({
              href: `/sites/${s.id}`,
              label: s.name,
              meta: s.tipo,
            }))}
          />
          <ResultBlock
            title="Causas"
            items={results.causas.map((c) => ({
              href: `/causas/${c.id}`,
              label: c.titulo,
              meta: c.rit || "",
            }))}
          />
          <ResultBlock
            title="Documentos"
            items={(results.documentos || []).map((d) => ({
              href: d.causaId ? `/causas/${d.causaId}` : "/documentos",
              label: d.nombre,
              meta: [
                d.tipo,
                d.ruta,
                d.causa ? d.causa.rit || d.causa.titulo : null,
              ]
                .filter(Boolean)
                .join(" · "),
            }))}
          />
          <ResultBlock
            title="Minutas"
            items={(results.minutas || []).map((m) => ({
              href: `/causas/${m.causaId}/minutas/${m.id}`,
              label: m.titulo,
              meta: `${m.tipo} · ${m.causa.rit || m.causa.titulo}`,
            }))}
          />
          <ResultBlock
            title="Archivos VDR"
            items={results.files.map((f) => ({
              href: `/sites/${f.site.id}/archivos`,
              label: f.name,
              meta: f.site.name,
            }))}
          />
          <ResultBlock
            title="Tareas"
            items={results.tasks.map((t) => ({
              href: t.site ? `/sites/${t.site.id}/tareas` : "/tareas",
              label: t.title,
              meta: t.site?.name || "",
            }))}
          />
          <ResultBlock
            title="Wiki"
            items={results.wiki.map((w) => ({
              href: `/sites/${w.site.id}/wiki`,
              label: w.title,
              meta: w.site.name,
            }))}
          />
          <ResultBlock
            title="Jurisprudencia"
            items={results.jurisprudencia.map((j) => ({
              href: `/jurisprudencia?q=${encodeURIComponent(j.rol)}`,
              label: j.caratula || j.rol,
              meta: j.rol,
            }))}
          />
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
          <Link
            key={i.href + i.label}
            href={i.href}
            className="block rounded-xl border border-[var(--line)] px-3 py-2 text-sm hover:border-[var(--sea)]/40"
          >
            <div className="font-medium">{i.label}</div>
            <div className="text-xs text-[var(--ink-soft)]/65">{i.meta}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
