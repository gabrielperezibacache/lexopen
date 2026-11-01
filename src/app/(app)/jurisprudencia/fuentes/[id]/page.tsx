import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { readLegalSourceVersion } from "@/lib/research/service";
import { PageHeader } from "@/components/ui/PageHeader";
import { VerifiedCitationButton } from "@/components/VerifiedCitationButton";

const date = (value: Date) => value.toLocaleDateString("es-CL", { timeZone: "UTC" });
export default async function LegalSourcePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ after?: string; fragment?: string; q?: string }> }) {
  const user = await requireStaff(), { id } = await params, sp = await searchParams;
  const position = sp.after ? Number(sp.after) : sp.fragment ? Number(sp.fragment) - 1 : 0;
  let source;
  try { source = await readLegalSourceVersion(id, user, { after: Number.isSafeInteger(position) && position >= 0 ? position : 0, q: sp.q?.slice(0, 200) }); }
  catch (e) { if ((e as { status?: number }).status === 404) notFound(); throw e; }
  const pageLink = (after: number) => `/jurisprudencia/fuentes/${id}?after=${after}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`;
  return <div className="space-y-6">
    <Link href="/jurisprudencia" className="text-sm text-[var(--sea)]">Volver a investigación y jurisprudencia</Link>
    <PageHeader title={source.title} subtitle={`${source.organism} · Versión ${source.acquisitionMethod === "manual" ? "registrada" : "recuperada"} el ${date(source.retrievedAt)}`} />
    <div className="flex flex-wrap gap-3"><a href={source.canonicalUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">Publicación oficial</a><a href={source.originalHref} className="btn btn-secondary">Descargar original registrado</a></div>
    <dl className="grid gap-4 text-sm sm:grid-cols-2"><div><dt className="font-semibold">Procedencia</dt><dd className="mt-1 text-[var(--ink-soft)]">{source.acquisitionMethod === "manual" ? "Aporte manual sin cotejo oficial" : "Recuperada del sitio oficial"}</dd></div><div><dt className="font-semibold">Fecha consignada en la fuente</dt><dd className="mt-1 text-[var(--ink-soft)]">{source.publishedAt ? date(source.publishedAt) : "No consta en los metadatos recuperados"}</dd></div></dl>
    <p className="max-w-[75ch] text-sm text-[var(--ink-soft)]">Esta referencia conserva el texto consultado. La fecha de consulta o publicación no acredita la vigencia; contraste la versión aplicable antes de usarla en un escrito.</p>
    {source.warnings.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm">{source.warnings.map(w => <li key={w}>{w}</li>)}</ul>}
    <form className="flex flex-wrap gap-2"><label htmlFor="legal-source-search" className="sr-only">Buscar en esta versión</label><input id="legal-source-search" type="search" name="q" maxLength={200} className="input min-w-0 flex-1" placeholder="Buscar en esta versión" defaultValue={sp.q} /><button className="btn btn-secondary">Buscar en texto</button></form>
    <div className="divide-y divide-[var(--line)] border-y border-[var(--line)]">{source.fragments.length ? source.fragments.map(fragment => <section id={`fragment-${fragment.ordinal}`} key={fragment.id} className="scroll-mt-24 space-y-4 py-6"><h2 className="font-semibold">Fragmento {fragment.ordinal}</h2><p className="max-w-[75ch] whitespace-pre-wrap break-words leading-relaxed">{fragment.text}</p><VerifiedCitationButton fragmentId={fragment.id} quote={fragment.text} title={source.title} href={`/jurisprudencia/fuentes/${id}?fragment=${fragment.ordinal}#fragment-${fragment.ordinal}`} /></section>) : <p className="py-6 text-sm">No hay fragmentos para este filtro. Pruebe otra palabra o quite la búsqueda.</p>}</div>
    <nav className="flex flex-wrap gap-3" aria-label="Fragmentos de la fuente">{position > 0 && <Link href={pageLink(0)} className="btn btn-secondary">Primeros fragmentos</Link>}{source.nextAfter !== null && <Link href={pageLink(source.nextAfter)} className="btn btn-secondary">Siguientes fragmentos</Link>}</nav>
    <details className="text-sm"><summary className="cursor-pointer font-medium">Identificación de la versión</summary><p className="mt-2 break-all">SHA-256 original: {source.sourceSha256}</p><p className="mt-2 break-all">SHA-256 texto: {source.textSha256}</p></details>
  </div>;
}
