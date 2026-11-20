import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { readFiscaliaDetail } from "@/lib/fiscalia/detail";
import { FISCALIA_STATUSES, FISCALIA_KINDS, FISCALIA_PORTAL, fiscaliaNextAction, type FiscaliaState } from "@/lib/fiscalia/contract";
import { getI18n } from "@/lib/i18n/server";
import { formatCivilDate } from "@/lib/chile-time";
import { FiscaliaDetailActions } from "@/components/fiscalia/FiscaliaDetailActions";
import type { FiscaliaItem } from "@/components/fiscalia/FiscaliaWorkspace";
import { ListPagination } from "@/components/ui/ListPagination";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ after?: string }> }) {
  const { id } = await params, { after } = await searchParams, user = await requireStaff();
  const { dict } = await getI18n(), operations = dict.judicialOperations;
  if (after !== undefined && typeof after !== "string") notFound();
  const { row, canEdit, history, next } = await readFiscaliaDetail(id, user, after).catch(error => {
    if (error.status === 404 || error.status === 400) notFound();
    throw error;
  });
  const status = (s: string) => FISCALIA_STATUSES[s as FiscaliaState] || s;
  const item = JSON.parse(JSON.stringify({ ...row, canEdit, events: [] })) as FiscaliaItem;
  return <div className="min-w-0 space-y-5 break-words">
    <nav className="flex flex-wrap gap-4 text-sm"><Link className="underline" href={`/mi-fiscalia?causaId=${row.causaId}`}>Solicitudes de la causa</Link><Link className="underline" href={`/causas/${row.causaId}`}>{row.causa.titulo}</Link></nav>
    <PageHeader title={row.title} subtitle={`${FISCALIA_KINDS[item.kind]} · ${status(row.status)}`} />
    <section className="panel space-y-3 rounded-2xl p-5" aria-label="Datos de la solicitud">
      <dl className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        <div><dt>RUC</dt><dd>{row.ruc || "Por confirmar"}</dd></div>
        <div className="min-w-0"><dt>Folio registrado</dt><dd className="[overflow-wrap:anywhere]">{row.folio || operations.noFolio}</dd></div>
        {row.submittedAt && <div><dt>Presentación registrada por el estudio</dt><dd>{formatCivilDate(row.submittedAt)}</dd></div>}
        {row.followUpDate && <div><dt>Seguimiento del estudio</dt><dd>{formatCivilDate(row.followUpDate)}</dd></div>}
      </dl>
      <div className="border-y border-[var(--line)] py-4"><h2 className="font-semibold">{operations.nextManagement}</h2><p className="mt-1 text-sm">{operations[fiscaliaNextAction(row.status)]}</p><p className="mt-1 text-xs text-[var(--muted)]">{row.followUpDate ? formatCivilDate(row.followUpDate) : operations.noFollowup}</p></div>
      <h2 className="font-semibold">Contenido de la solicitud</h2><p className="whitespace-pre-wrap">{row.body || "Borrador sin contenido."}</p>
      {row.responseText && <><h2 className="font-semibold">Respuesta registrada{row.answeredAt && ` · ${formatCivilDate(row.answeredAt)}`}</h2><p className="whitespace-pre-wrap">{row.responseText}</p></>}
    </section>
    <section className="panel space-y-4 rounded-2xl p-5" aria-label={operations.actionsEvidence}>
      <h2 className="font-semibold">{operations.actionsEvidence}</h2>
      <p className="text-sm text-[var(--ink-soft)]">{operations.historyScope}</p>
      <div className="flex flex-wrap gap-3"><a className="btn btn-secondary" href={`/api/fiscalia/solicitudes/${id}/export`} download>Descargar preparación</a><a className="btn btn-ghost" href={FISCALIA_PORTAL} target="_blank" rel="noreferrer">Abrir Mi Fiscalía con ClaveÚnica</a><Link className="btn btn-ghost" href={`/causas/${encodeURIComponent(row.causaId)}/expediente`}>{operations.openCaseArchive}</Link></div>
      {canEdit && <FiscaliaDetailActions key={row.updatedAt.toISOString()} item={item} userId={user.id} />}
    </section>
    <section id="historial" className="panel scroll-mt-24 space-y-3 rounded-2xl p-5" aria-label="Historial de la solicitud"><h2 className="font-semibold">Historial de la solicitud</h2>
      <ol className="space-y-3">{history.map(event => <li key={event.id} className="border-t pt-3">
        <p className="font-medium">{event.action === "correct" ? "Rectificación de presentación" : event.evidenceKind === "receipt" ? "Comprobante de presentación" : event.evidenceKind === "answer" ? "Respaldo de respuesta" : status(event.status)}</p>
        <p className="text-sm">{event.actorName} · {new Date(event.at).toLocaleString("es-CL", { timeZone: "America/Santiago" })}</p>
        {event.action === "correct" && <div className="mt-1 text-sm"><p>Anterior: {event.previousFolio || "Sin folio"} · {event.previousSubmittedAt || "Sin fecha"}</p><p>Corregido: {event.correctedFolio} · {event.correctedSubmittedAt}</p><p>Motivo: {event.correctionReason}</p></div>}
        {event.document ? <a className="underline" href={event.document.href} download>{event.document.name} · versión {event.document.version}</a> : event.evidenceKind && <p>Respaldo no disponible.</p>}
      </li>)}</ol>
      {(next || after) && <ListPagination path={`/mi-fiscalia/${id}`} after={after} next={next} count={history.length} />}
    </section>
  </div>;
}
