import Link from "next/link";
import { ArrowDownToLine, FilePlus2, Mail } from "lucide-react";
import { formatDateTime } from "@/components/ui";
import type { listCaseUpdates } from "@/lib/causas/updates";
import type { Locale } from "@/lib/i18n";

type Feed = Awaited<ReturnType<typeof listCaseUpdates>>;

export function CaseDocumentNews({ feed, archiveHref, newsHref, older, canWrite, locale }: {
  feed: Feed;
  archiveHref: string;
  newsHref: string;
  older: boolean;
  canWrite: boolean;
  locale: Locale;
}) {
  const tr = (es: string, en: string) => locale === "en" ? en : es;
  const originLabel = { manual: tr("Carga manual", "Manual upload"), mail: tr("Correo", "Mail") };
  return (
    <section className="panel rounded-[var(--radius-lg)] p-4 sm:p-5" aria-labelledby="case-news-title" data-testid="case-news">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 id="case-news-title" className="text-lg font-semibold">{tr("Últimos ingresos", "Recent additions")}</h2>
          <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{tr("Documentos y avisos incorporados por correo o carga manual, con el origen de cada ingreso.", "Documents and notices received by email or uploaded manually, with the source of each intake.")}</p>
        </div>
        {canWrite && <Link className="btn btn-secondary" href={`${archiveHref}#incorporar-documentos`}><FilePlus2 size={16} aria-hidden="true" />{tr("Añadir archivos", "Add files")}</Link>}
      </header>
      {feed.items.length ? (
        <ol className="mt-4 divide-y divide-[var(--line)] border-y border-[var(--line)]">
          {feed.items.map(item => {
            if (item.kind === "mail-notice") return (
              <li key={`mail-${item.messageId}`} className="py-3">
                <Link href={item.mailHref} className="inline-flex min-h-11 items-center gap-2 py-2 text-sm font-semibold text-[var(--ink)] hover:text-[var(--sea)] hover:underline">
                  <Mail size={16} aria-hidden="true" />{tr("Correo incorporado", "Filed email")}
                </Link>
                <p className="text-xs text-[var(--muted)]"><time dateTime={item.latestAt}>{formatDateTime(item.latestAt, locale)}</time></p>
              </li>
            );
            const id = encodeURIComponent(item.documentId);
            const kinds = [...new Set(item.origins.map(origin => origin.kind))];
            const showHistory = item.origins.length > 1 || item.moreOrigins || item.version > 1 || Boolean(item.origins[0]?.mailHref);
            return (
              <li key={item.documentId} className="grid gap-x-5 gap-y-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <div className="min-w-0">
                  <Link href={`/documentos/${id}/fuentes`} className="inline-flex min-h-11 items-center break-words py-2 text-sm font-semibold text-[var(--ink)] hover:text-[var(--sea)] hover:underline [overflow-wrap:anywhere]">
                    {item.title}
                  </Link>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
                    <time dateTime={item.latestAt}>{formatDateTime(item.latestAt, locale)}</time>
                    {kinds.map(kind => {
                      const Icon = kind === "mail" ? Mail : FilePlus2;
                      return <span key={kind} className="inline-flex items-center gap-1.5"><Icon size={14} aria-hidden="true" />{originLabel[kind]}</span>;
                    })}
                    {item.version > 1 && <span>{tr("Versión", "Version")} {item.version}</span>}
                    {["failed", "needs_ocr"].includes(item.status || "") && <span>{tr("Revisar lectura", "Check extracted text")}</span>}
                    {["pending", "queued", "processing"].includes(item.status || "") && <span>{tr("Preparando texto", "Extracting text")}</span>}
                  </div>
                </div>
                {item.hasOriginal && <a className="inline-flex min-h-11 w-fit items-center gap-2 text-sm text-[var(--sea)] underline-offset-4 hover:underline"
                  href={`/api/documentos/${id}/content`} download={item.title}>
                  <ArrowDownToLine size={16} aria-hidden="true" />
                  {item.version > 1 ? tr("Descargar versión actual", "Download current version") : tr("Descargar original", "Download original")}
                </a>}
                {showHistory && (
                  <details className="text-sm sm:col-span-2">
                    <summary className="min-h-11 cursor-pointer py-3 text-[var(--sea)]">{tr("Ver ingresos", "See intake history")}</summary>
                    <ul className="space-y-1 pb-1 text-xs text-[var(--muted)]">
                      {item.origins.map((origin, index) => (
                        <li key={`${origin.kind}-${origin.receivedAt}-${index}`} className="flex flex-wrap items-center gap-x-2">
                          <span>{originLabel[origin.kind]}</span>
                          <time dateTime={origin.receivedAt}>{formatDateTime(origin.receivedAt, locale)}</time>
                          {item.version > 1 && <span>{origin.documentVersion
                            ? `${tr("Versión", "Version")} ${origin.documentVersion}`
                            : tr("Ingreso anterior", "Earlier intake")}</span>}
                          {origin.mailHref && <Link href={origin.mailHref} className="inline-flex min-h-11 items-center text-[var(--sea)] underline underline-offset-4">{tr("Abrir correo", "Open email")}</Link>}
                        </li>
                      ))}
                    </ul>
                    {item.moreOrigins && <p className="text-xs text-[var(--muted)]">{tr("Se muestran los ingresos más recientes.", "Showing the most recent intakes.")}</p>}
                  </details>
                )}
              </li>
            );
          })}
        </ol>
      ) : <p className="mt-4 border-t border-[var(--line)] pt-4 text-sm text-[var(--muted)]">{tr("Todavía no hay ingresos por correo ni archivos cargados en esta causa.", "There are no email attachments or manual uploads for this matter yet.")}</p>}
      {(older || feed.nextBefore) && (
        <nav className="mt-2 flex flex-wrap gap-x-3 text-sm" aria-label={tr("Páginas de novedades", "Updates pages")}>
          {older && <Link className="btn btn-ghost" href={newsHref}>{tr("Volver a lo reciente", "Back to recent")}</Link>}
          {feed.nextBefore && <Link className="btn btn-ghost" href={`${newsHref}&antes=${encodeURIComponent(feed.nextBefore)}`}>{tr("Ver ingresos anteriores", "See earlier additions")}</Link>}
        </nav>
      )}
    </section>
  );
}
