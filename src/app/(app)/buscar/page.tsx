"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { ModuleHeader } from "@/components/ui/PageHeader";
import { useI18n } from "@/components/i18n/I18nProvider";
import "@/components/search/search.css";

type Results = {
  q: string;
  sites: Array<{ id: string; name: string; tipo: string }>;
  causas: Array<{ id: string; titulo: string; rit: string | null; site?: { id: string; name: string } | null }>;
  clientes?: Array<{
    id: string;
    razonSocial: string;
    rut: string | null;
    estado: string;
    _count?: { sites: number };
  }>;
  tramites?: Array<{
    id: string;
    titulo: string;
    estado: string;
    causa: {
      id: string;
      rit: string | null;
      titulo: string;
      clienteId: string | null;
      cliente: { id: string; razonSocial: string } | null;
    };
  }>;
  files: Array<{ id: string; name: string; site: { id: string; name: string } }>;
  documentos: Array<{
    id: string;
    nombre: string;
    tipo: string;
    ruta: string | null;
    causaId: string | null;
    clienteId?: string | null;
    causa: { id: string; rit: string | null; titulo: string } | null;
    cliente?: { id: string; razonSocial: string } | null;
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

export default function SearchPage() {
  const { dict, t } = useI18n();
  const h = dict.hubs.buscar;
  const [results, setResults] = useState<Results | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<{ message: string; query: string } | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  useEffect(() => () => activeRequest.current?.abort(), []);

  async function runSearch(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setBusy(true);
    setQuery(trimmed);
    setError(null);
    setResults(null);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
      });
      const data = await res.json();
      if (controller.signal.aborted) return;
      if (!res.ok) {
        setError({ message: typeof data?.error === "string" ? data.error : h.error, query: trimmed });
        return;
      }
      setResults({
        q: trimmed,
        sites: Array.isArray(data.sites) ? data.sites : [],
        causas: Array.isArray(data.causas) ? data.causas : [],
        clientes: Array.isArray(data.clientes) ? data.clientes : [],
        tramites: Array.isArray(data.tramites) ? data.tramites : [],
        files: Array.isArray(data.files) ? data.files : [],
        documentos: Array.isArray(data.documentos) ? data.documentos : [],
        tasks: Array.isArray(data.tasks) ? data.tasks : [],
        jurisprudencia: Array.isArray(data.jurisprudencia) ? data.jurisprudencia : [],
        wiki: Array.isArray(data.wiki) ? data.wiki : [],
        minutas: Array.isArray(data.minutas) ? data.minutas : [],
      });
    } catch {
      if (controller.signal.aborted) return;
      setError({ message: h.error, query: trimmed });
    } finally {
      if (activeRequest.current === controller) setBusy(false);
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = String(new FormData(e.currentTarget).get("q") || "");
    await runSearch(q);
  }

  const hasMatches = results && Object.values(results).some(value => Array.isArray(value) && value.length > 0);

  return (
    <div className="unified-search-page">
      <ModuleHeader
        artwork="research"
        eyebrow={h.eyebrow}
        title={h.title}
        subtitle={h.subtitle}
      />
      <form role="search" onSubmit={onSubmit} className="unified-search-form panel mb-6 flex flex-col gap-3 p-4 sm:flex-row">
        <label htmlFor="unified-search" className="sr-only">
          {t("common.searchInApp")}
        </label>
        <input
          id="unified-search"
          type="search"
          className="input"
          name="q"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          maxLength={200}
          placeholder={t("common.searchPlaceholder")}
          aria-label={t("common.searchInApp")}
          required
        />
        <button className="btn btn-primary" disabled={busy} type="submit" aria-busy={busy}>
          {busy ? h.searching : h.title}
        </button>
      </form>

      <p role="status" aria-live="polite" className="mb-4 text-sm text-[var(--ink-soft)]">
        {busy
          ? h.searching
          : results
            ? (hasMatches ? h.resultsFor.replace("{q}", results.q) : h.empty)
            : ""}
      </p>

      {error && (
        <div className="unified-search-error mb-4 flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
          <p role="alert">{error.message}</p>
          <button type="button" className="btn btn-secondary" onClick={() => runSearch(error.query)}>
            {t("common.retry")}
          </button>
        </div>
      )}

      {!busy && !error && !results && (
        <section className="unified-search-intro">
          <h2 className="font-semibold">{h.start}</h2>
          <p className="mt-2 text-sm text-[var(--ink-soft)]">
            {h.hint}
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

      {results && hasMatches && (
        <div className="unified-search-results grid gap-5 lg:grid-cols-2" aria-busy={busy}>
          <ResultBlock
            title={t("nav.sites")}
            items={results.sites.map((s) => ({
              href: `/sites/${s.id}`,
              label: s.name,
              meta: s.tipo,
            }))}
          />
          <ResultBlock
            title={t("nav.cases")}
            items={results.causas.map((c) => ({
              href: `/causas/${c.id}`,
              label: c.titulo,
              meta: [c.rit, c.site ? `${h.spaceLabel}: ${c.site.name}` : null].filter(Boolean).join(" · "),
            }))}
          />
          <ResultBlock
            title={t("nav.clients")}
            items={(results.clientes || []).map((c) => ({
              href: `/clientes/${c.id}`,
              label: c.razonSocial,
              meta: [
                c.rut,
                c.estado,
                c._count?.sites ? `${h.spacesCount}: ${c._count.sites}` : null,
              ]
                .filter(Boolean)
                .join(" · "),
            }))}
          />
          <ResultBlock
            title={t("hubs.buscar.caseActions")}
            items={(results.tramites || []).map((t) => ({
              href: t.causa.clienteId
                ? `/clientes/${t.causa.clienteId}?causa=${t.causa.id}`
                : `/causas/${t.causa.id}#tramites`,
              label: t.titulo,
              meta: [
                t.estado,
                t.causa.cliente?.razonSocial,
                t.causa.rit || t.causa.titulo,
              ]
                .filter(Boolean)
                .join(" · "),
            }))}
          />
          <ResultBlock
            title={t("nav.documents")}
            items={(results.documentos || []).map((d) => ({
              href: d.cliente
                ? `/clientes/${d.cliente.id}`
                : d.causaId
                  ? `/causas/${d.causaId}`
                  : "/documentos",
              label: d.nombre,
              meta: [
                d.tipo,
                d.ruta,
                d.cliente?.razonSocial ||
                  (d.causa ? d.causa.rit || d.causa.titulo : null),
              ]
                .filter(Boolean)
                .join(" · "),
            }))}
          />
          <ResultBlock
            title={t("nav.minutes")}
            items={(results.minutas || []).map((m) => ({
              href: `/causas/${m.causaId}/minutas/${m.id}`,
              label: m.titulo,
              meta: `${m.tipo} · ${m.causa.rit || m.causa.titulo}`,
            }))}
          />
          <ResultBlock
            title={t("hubs.buscar.spaceFiles")}
            items={results.files.map((f) => ({
              href: `/sites/${f.site.id}/archivos`,
              label: f.name,
              meta: f.site.name,
            }))}
          />
          <ResultBlock
            title={t("nav.tasks")}
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
            title={t("nav.jurisprudence")}
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
  if (!items.length) return null;
  return (
    <section className="unified-search-block">
      <div className="unified-search-block-heading"><h2 className="font-semibold">{title}</h2><span>{items.length}</span></div>
      <div className="mt-3 space-y-2">
        {items.map((i) => (
          <Link
            key={i.href + i.label}
            href={i.href}
            className="unified-search-result block text-sm"
          >
            <div className="font-medium">{i.label}</div>
            <div className="unified-search-result-meta text-[var(--ink-soft)]">{i.meta}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
