import { taskWorkspaceAccessWhere } from "@/lib/tasks/workspace";
import { PageHeader } from "@/components/ui/PageHeader";
import { CaseAudioManager } from "@/components/audio/CaseAudioManager";
import { CaseKnowledgePanel } from "@/components/knowledge/CaseKnowledgePanel";
import { CausaActions } from "@/components/CausaActions";
import { CausaMovimientoForm } from "@/components/CausaMovimientoForm";
import { ConflictReviewPanel } from "@/components/ConflictReviewPanel";
import { DocumentDriveAction } from "@/components/DocumentDriveAction";
import { DocumentoIngestForm } from "@/components/DocumentoIngestForm";
import { DriveFolderPanel } from "@/components/DriveFolderPanel";
import { CausaResumenAi } from "@/components/ai/CausaResumenAi";
import { DocumentoAiActions } from "@/components/ai/DocumentoAiActions";
import { PlazoSugerirAi } from "@/components/ai/PlazoSugerirAi";
import { CausaEquipoPanel } from "@/components/causas/CausaEquipoPanel";
import { CasePreparation, CasePreparationIndex } from "@/components/causas/CasePreparation";
import { CaseWorkflowNav } from "@/components/causas/CaseWorkflowNav";
import { TramitesPanel } from "@/components/clientes/TramitesPanel";
import { CausaDocumentImportButton } from "@/components/pjud/CausaDocumentImportButton";
import { PjudMonitorPanel } from "@/components/pjud/PjudMonitorPanel";
import { CreateSiteFromCausaButton } from "@/components/sites/NewSiteButton";
import { StatusBadge, UrgenciaBadge, formatDate, formatDateTime } from "@/components/ui";
import { confidentialWhere, minutaConfidentialWhere } from "@/lib/api";
import { assertCausaAccess, causaAccessWhere as scopedcausaAccessWhere, documentReadWhere as scopeddocumentReadWhere, plazoAccessWhere, requiredCausaWhere as scopedrequiredCausaWhere } from "@/lib/auth/causa-access";
import { can, canSome } from "@/lib/auth/permissions";
import { publicUserSelect } from "@/lib/auth/public-user";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { requireStaff } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/rbac";
import { getCaseManagementMode, type CaseManagementMode } from "@/lib/causas/management-mode";
import { PjudManagementNotice } from "./PjudManagementNotice";
import { TRIBUNALES_CHILE, labelEtapa, labelMateria } from "@/lib/chile";
import { formatCivilDate } from "@/lib/chile-time";
import { labelConflictStatus } from "@/lib/conflict";
import { prisma } from "@/lib/db";
import { getI18n } from "@/lib/i18n/server";
import {
  isPlaceholderDriveFolderId,
  isRealDriveFolderId,
} from "@/lib/integrations/drive-folder";
import { ACCIONES_ABIERTAS, labelTipoMinuta } from "@/lib/minutas";
import { labelCausaOrigen } from "@/lib/pjud/causa-origin";
import {
  diasEntre,
  semaforoPorDiasSinMovimiento,
} from "@/lib/pjud/classify";
import { diasRestantes, labelDiasRestantes, labelTipoComputo } from "@/lib/plazos";
import { documentoListSelect } from "@/lib/sites/file-select";
import { siteTipoLabel } from "@/lib/sites/labels";
import Link from "next/link";
import { notFound } from "next/navigation";

export type CaseWorkspaceParams = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
};

export async function CaseWorkspaceServer({ params, mode }: CaseWorkspaceParams & { mode: CaseManagementMode }) {
  const user = await requireStaff();
  if (mode === "pjud_cl" && await getCaseManagementMode() !== "pjud_cl") return <PjudManagementNotice canConfigure={isAdmin(user)} />;
  const connected = mode === "pjud_cl";
  const { t, dict } = await getI18n();
  const h = dict.hubs.causaDetail;
  const { id } = await params;
  const access = await assertCausaAccess(id, user).catch(() => null);
  if (!access) notFound();
  const canUseKnowledge = canSome(user, "assistant.use");
  const backHref = connected ? "/pjud" : "/causas";
  const backLabel = connected ? "Volver a PJUD" : "Volver a mis causas";
  const [causa, responsables, totalAccionesAbiertas, textStatus, preparation] = await Promise.all([
    prisma.causa.findFirst({
      where: { AND: [scopedcausaAccessWhere(user), { id }] },
      include: {
        cliente: true,
        abogado: { select: publicUserSelect },
        partes: true,
        documentos: {
          where: { AND: [scopeddocumentReadWhere(user), confidentialWhere(user)] },
          orderBy: { updatedAt: "desc" },
          select: {
            ...documentoListSelect,
            storageKey: true,
          },
        },
        plazos: { where: plazoAccessWhere(user),  orderBy: { fechaLimite: "asc" } },
        tramites: { where: { AND: [scopedrequiredCausaWhere(user), { OR: [{ task: null }, { task: { is: taskWorkspaceAccessWhere(user) } }] }] },
          orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
          include: { responsable: { select: { id: true, name: true } } },
        },
        notas: { orderBy: { updatedAt: "desc" } },
        etapaHistorial: { orderBy: { createdAt: "desc" } },
        movimientos: { where: scopedrequiredCausaWhere(user),  orderBy: { fecha: "desc" }, take: 200 },
        minutas: {
          where: { AND: [scopedrequiredCausaWhere(user), minutaConfidentialWhere(user)] },
          include: {
            autor: { select: { name: true } },
            _count: {
              select: {
                acciones: {
                  where: { estado: { in: [...ACCIONES_ABIERTAS] } },
                },
              },
            },
          },
          orderBy: { fecha: "desc" },
          take: 12,
        },
        actividades: {
          include: { user: { select: publicUserSelect } },
          orderBy: { createdAt: "desc" },
          take: 30,
        },
        site: { select: { id: true, name: true, tipo: true, isClientVisible: true } },
        miembros: {
          include: { user: { select: publicUserSelect } },
          orderBy: [{ rol: "asc" }, { createdAt: "asc" }],
        },
        _count: {
          select: {
            minutas: { where: { AND: [scopedrequiredCausaWhere(user), minutaConfidentialWhere(user)] } },
          },
        },
      },
    }),
    prisma.user.findMany({
      where: {
        OR: [
          { role: { in: [...STAFF_ROLES] } },
          { role: "externo" },
        ],
      },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
    prisma.minutaAccion.count({
      where: {
        minuta: { AND: [{ causaId: id }, scopedrequiredCausaWhere(user), minutaConfidentialWhere(user)] },
        estado: { in: [...ACCIONES_ABIERTAS] },
      },
    }),
    // ⚡ Bolt: Move textStatus query into Promise.all to fetch concurrently with the causa, saving a round-trip
    prisma.$queryRaw<{id: string, has_text: boolean, has_markdown: boolean}[]>`
      SELECT id,
             (length(trim(coalesce("extractedMarkdown", ''))) + length(trim(coalesce("contenido", '')))) > 0 as has_text,
             length(trim(coalesce("extractedMarkdown", ''))) > 0 as has_markdown
      FROM "Documento"
      WHERE "causaId" = ${id}
    `,
    canUseKnowledge ? Promise.all([
      // A hearing desk belongs to its professional, even within a shared cause.
      prisma.hearingWorkspace.count({ where: { causaId: id, ownerId: user.id } }),
      prisma.caseAudio.findMany({
        where: { causaId: id, deletedAt: null, sourceDocument: { AND: [{ causaId: id }, scopeddocumentReadWhere(user)] } },
        select: { sourceDocumentId: true, storageKey: true, transcriptSha256: true },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: 201,
      }),
    ]).then(([privateHearingCount, audios]) => ({ privateHearingCount, audios })) : Promise.resolve({ privateHearingCount: 0, audios: [] }),
  ]);
  if (!causa) notFound();

  const statusMap = new Map(textStatus.map((s) => [s.id, s]));

  const documentos = causa.documentos.map(
    ({ storageKey, ...rest }) => ({
      ...rest,
      hasText: statusMap.get(rest.id)?.has_text ?? false,
      hasMarkdown: statusMap.get(rest.id)?.has_markdown ?? false,
      hasBinary: Boolean(storageKey),
    })
  );
  const audioDocuments = new Map(causa.documentos.map(document => [document.id, document.storageKey]));
  // Match the audio listing's source binding without exposing a hidden document.
  const visibleAudios = preparation.audios.slice(0, 200).filter(audio => audioDocuments.get(audio.sourceDocumentId) === audio.storageKey);

  const origen = labelCausaOrigen({
    pjudOrigin: causa.pjudOrigin,
    pjudFromMisCausas: causa.pjudFromMisCausas,
    pjudSource: causa.pjudSource,
  });

  const ultimoMov = causa.movimientos[0] || null;
  const diasSinMovimiento = ultimoMov ? diasEntre(ultimoMov.fecha) : null;
  const semaforo = semaforoPorDiasSinMovimiento(diasSinMovimiento);

  const accionesAbiertas = totalAccionesAbiertas;
  const proximosPlazos = causa.plazos.filter(
    (p) => p.estado === "pendiente" || p.estado === "vencido"
  );
  const tribunalEnCatalogo = TRIBUNALES_CHILE.includes(
    causa.tribunal as (typeof TRIBUNALES_CHILE)[number]
  );

  return (
    <div className="space-y-6">
      <Link href={backHref} className="inline-flex min-h-11 items-center text-sm text-[var(--sea)] hover:underline">
        {backLabel}
      </Link>
      <PageHeader
        title={causa.titulo}
        subtitle={<>{causa.caratula || h.noCaratula}{causa.rit ? ` · ${causa.rit}` : ""}</>}
      />
      {canUseKnowledge && <CaseWorkflowNav causaId={causa.id} title={causa.titulo} current="case" mode={mode} />}
      {can(user, "causa.write", { causaRol: access.causaRol }) && <Link href={`/offline.html?kind=causa&record=${causa.id}`} className="btn btn-secondary">Trabajar sin conexión</Link>}
      <CausaActions causaId={causa.id} titulo={causa.titulo} estado={causa.estado} isAdmin={user.role === "admin"} />
          <div className="flex flex-wrap gap-2">
            <StatusBadge estado={causa.estado} />
            <span className="badge badge-sea">{labelMateria(causa.materia)}</span>
            <span className="badge badge-ink">{labelEtapa(causa.etapa)}</span>
            {connected && origen && (
              <span className="badge badge-ink">
                {h.origin.replace("{label}", origen)}
              </span>
            )}
            <span
              className={
                causa.conflictStatus === "blocked"
                  ? "badge badge-vencido"
                  : causa.conflictStatus === "warning"
                    ? "badge badge-pendiente"
                    : "badge badge-activa"
              }
            >
              {h.conflicts.replace("{status}", labelConflictStatus(causa.conflictStatus))}
            </span>
            {isRealDriveFolderId(causa.googleDriveFolderId) && (
              <span className="badge badge-activa">{h.driveLinked}</span>
            )}
            {isPlaceholderDriveFolderId(causa.googleDriveFolderId) &&
              causa.googleDriveFolderId && (
                <span className="badge badge-pendiente">{h.driveStub}</span>
              )}
          </div>


      {["warning", "blocked"].includes(causa.conflictStatus) && <ConflictReviewPanel causaId={causa.id} status={causa.conflictStatus} notes={causa.conflictNotes} />}
      <CasePreparationIndex canUseKnowledge={canUseKnowledge} />
      {proximosPlazos.length > 0 && (
        <section className="panel rounded-[var(--radius-lg)] px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Próximos plazos</h2>
            <Link href={`/plazos?causaId=${causa.id}`} className="text-sm text-[var(--sea)]">
              Registrar plazo
            </Link>
          </div>
          <div className="mt-3 grid gap-2">
            {proximosPlazos.slice(0, 4).map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-solid)] px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <div className="font-medium break-words">
                    {p.esFatal ? "Fatal · " : ""}
                    {p.titulo}
                  </div>
                  <div className="text-xs text-[var(--muted)]">
                    {formatCivilDate(p.fechaLimite)} · {labelTipoComputo(p.tipoComputo)} ·{" "}
                    {labelDiasRestantes(diasRestantes(p.fechaLimite))}
                  </div>
                </div>
                <UrgenciaBadge fecha={p.fechaLimite} estado={p.estado} />
              </div>
            ))}
          </div>
        </section>
      )}

      <CasePreparation
        causaId={id}
        documentCount={documentos.length}
        documentsWithText={documentos.filter(document => document.hasText).length}
        pendingDocuments={documentos.filter(document => ["pending", "processing", "queued"].includes(document.extractionStatus || "")).length}
        minutaCount={causa._count.minutas}
        pendingActions={accionesAbiertas}
        canUseKnowledge={canUseKnowledge}
        privateHearingCount={preparation.privateHearingCount}
        audioCount={visibleAudios.length}
        transcriptCount={visibleAudios.filter(audio => Boolean(audio.transcriptSha256)).length}
        audioLimited={preparation.audios.length > 200}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div id="ficha" className="panel case-destination rounded-[var(--radius-lg)] p-5 lg:col-span-2">
          <h2 className="text-lg font-semibold">{connected ? "Ficha procesal" : "Ficha de la causa"}</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-[var(--muted)]">{connected ? "RIT/ROL" : "Referencia"}</dt><dd className="font-medium">{causa.rit || "—"}</dd></div>
            <div><dt className="text-[var(--muted)]">{connected ? "Tribunal" : "Órgano o institución"}</dt><dd className="font-medium">{causa.tribunal || "—"}{connected && !tribunalEnCatalogo && causa.tribunal && <span className="mt-1 block text-xs font-normal text-[var(--muted)]">El tribunal no está en el catálogo. Puede corregirlo al editar.</span>}</dd></div>
            <div><dt className="text-[var(--muted)]">Cliente</dt><dd className="font-medium">{causa.cliente ? <Link href={`/clientes/${causa.cliente.id}`} className="text-[var(--sea)] hover:underline">{causa.cliente.razonSocial}</Link> : "—"}</dd></div>
            <div><dt className="text-[var(--muted)]">Profesional responsable</dt><dd className="font-medium">{causa.abogado?.name || "—"}</dd></div>
          </dl>
          <details className="mt-3 text-sm"><summary className="min-h-11 cursor-pointer py-3 text-[var(--ink-soft)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--sea)]">Más datos de la causa</summary><dl className="mt-2 grid gap-3 sm:grid-cols-2">
            {causa.procedimiento && <div><dt className="text-[var(--muted)]">Procedimiento</dt><dd>{causa.procedimiento}</dd></div>}
            {causa.ruc && <div><dt className="text-[var(--muted)]">{connected ? "RUC" : "Referencia adicional"}</dt><dd>{causa.ruc}</dd></div>}
            {causa.fechaIngreso && <div><dt className="text-[var(--muted)]">Ingreso</dt><dd>{formatDate(causa.fechaIngreso)}</dd></div>}
            <div><dt className="text-[var(--muted)]">Conflictos de interés</dt><dd>{labelConflictStatus(causa.conflictStatus)}{causa.conflictCheckedAt ? ` · ${formatDate(causa.conflictCheckedAt)}` : ""}</dd></div>
            {causa.conflictNotes && <div><dt className="text-[var(--muted)]">Notas de revisión</dt><dd>{causa.conflictNotes}</dd></div>}
          </dl></details>
          <p className="mt-4 text-sm leading-relaxed text-[var(--ink-soft)]/85">
            {causa.resumen || "Sin resumen."}
          </p>
          <CausaResumenAi causaId={causa.id} titulo={causa.titulo} />
        </div>

        <DriveFolderPanel
          canImport={can(user, "causa.write", { causaRol: access.causaRol })}
          causaId={causa.id}
          folderId={causa.googleDriveFolderId}
          folderName={causa.googleDriveFolderName}
          folderUrl={causa.googleDriveFolderUrl}
        />
      </div>

      {canUseKnowledge && <CaseKnowledgePanel causaId={causa.id} proceduralEvents={causa.movimientos.map(m => ({ id: m.id, title: m.titulo, at: m.fecha.toISOString(), dateLabel: formatCivilDate(m.fecha), source: m.fuente }))} />}

      <section id="tramites" className="panel case-destination rounded-[var(--radius-lg)] p-5">
        <h2 className="mb-3 text-lg font-semibold">Trámites</h2>
        <TramitesPanel
          causaId={causa.id}
          tramites={causa.tramites}
          materia={causa.materia}
          responsables={responsables}
        />
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div id="minutas" className="panel case-destination rounded-[var(--radius-lg)] p-5 sm:col-span-2">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Minutas del expediente</h2>
            <Link href="/minutas" className="text-sm text-[var(--sea)]">
              Ver todas
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {causa.minutas.map((m) => (
              <Link
                key={m.id}
                href={`/causas/${causa.id}/minutas/${m.id}`}
                className="block rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-solid)] px-4 py-3 transition hover:border-[var(--sea)]/40"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="badge badge-sea">
                    {labelTipoMinuta(m.tipo)}
                  </span>
                  <span className="text-sm font-medium">{m.titulo}</span>
                </div>
                <div className="mt-1 text-xs text-[var(--muted)]">
                  {formatDateTime(m.fecha)} · {m.autor?.name || "Sin autor"} ·{" "}
                  {m._count.acciones} abiertas
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-[var(--ink-soft)]/80">
                  {m.resumenEjecutivo}
                </p>
              </Link>
            ))}
            {causa.minutas.length === 0 && (
              <p className="text-sm text-[var(--muted)]">
                Aún no hay minutas. Registre la primera tras el próximo acto.
              </p>
            )}
          </div>
        </div>

        <div className="panel rounded-[var(--radius-lg)] p-5">
          <h2 className="text-lg font-semibold">Partes</h2>
          <ul className="mt-4 space-y-3">
            {causa.partes.map((p) => (
              <li key={p.id} className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-solid)] px-3 py-2 text-sm">
                <div className="font-medium">{p.nombre}</div>
                <div className="text-[var(--muted)]">
                  {p.rol}
                  {p.rut ? ` · ${p.rut}` : ""}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <details className="border-y border-[var(--line)] py-2">
        <summary className="min-h-11 cursor-pointer py-3 text-lg font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--sea)]">Historial de etapa</summary>
        <div className="mt-4 space-y-3">
          {causa.etapaHistorial.map((h) => (
            <div key={h.id} className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-solid)] px-3 py-2 text-sm">
              <div className="font-medium">{labelEtapa(h.etapa)}</div>
              <div className="text-xs text-[var(--muted)]">
                {formatDateTime(h.createdAt)}
                {h.nota ? ` · ${h.nota}` : ""}
              </div>
            </div>
          ))}
          {causa.etapaHistorial.length === 0 && (
            <p className="text-sm text-[var(--muted)]">Sin cambios de etapa registrados.</p>
          )}
        </div>
      </details>

      {connected && <PjudMonitorPanel
        causaId={causa.id}
        monitoreoActivo={causa.pjudMonitoreoActivo}
        lastSyncAt={causa.pjudLastSyncAt}
        nextSyncAt={causa.pjudNextSyncAt}
        lastSyncStatus={causa.pjudLastSyncStatus}
        lastSyncNote={causa.pjudLastSyncNote}
        cuadernosCoverage={causa.pjudCuadernosCoverage}
        failCount={causa.pjudFailCount}
        sala={causa.sala}
        diasSinMovimiento={diasSinMovimiento}
        semaforo={semaforo}
        movimientos={causa.movimientos.map((m) => ({
          id: m.id,
          titulo: m.titulo,
          detalle: m.detalle,
          fuente: m.fuente,
          tipo: m.tipo,
          referencia: m.referencia,
          relevante: m.relevante,
          fecha: m.fecha,
          cuaderno: m.cuaderno,
          folio: m.folio,
          etapa: m.etapa,
          tramite: m.tramite,
          esReceptor: m.esReceptor,
          pendienteResolucion: m.pendienteResolucion,
          documentoRef: m.documentoRef,
        }))}
      />}

      <details className="border-y border-[var(--line)] py-2">
        <summary className="min-h-11 cursor-pointer py-3 text-lg font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--sea)]">Registrar movimientos manualmente</summary>
        <CausaMovimientoForm causaId={causa.id} />
      </details>

      <div className="grid gap-4 lg:grid-cols-2">
        <section id="plazos" className="panel case-destination rounded-[var(--radius-lg)] p-5">
          <h2 className="text-lg font-semibold">Plazos</h2>
          <div className="mt-4 space-y-3">
            {causa.plazos.map((p) => (
              <div key={p.id} className="flex min-w-0 items-start justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--line)] px-3 py-2 sm:items-center">
                <div className="min-w-0">
                  <div className="break-words text-sm font-medium">
                    {p.esFatal ? "Fatal · " : ""}
                    {p.titulo}
                  </div>
                  <div className="text-xs text-[var(--muted)]">
                    {formatCivilDate(p.fechaLimite)} · {labelTipoComputo(p.tipoComputo)}
                    {p.estado === "pendiente"
                      ? ` · ${labelDiasRestantes(diasRestantes(p.fechaLimite))}`
                      : ""}
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-1">
                  <UrgenciaBadge fecha={p.fechaLimite} estado={p.estado} />
                  <StatusBadge estado={p.estado} />
                </div>
              </div>
            ))}
            {causa.plazos.length === 0 && (
              <p className="text-sm text-[var(--muted)]">
                Sin plazos.{" "}
                <Link href={`/plazos?causaId=${causa.id}`} className="text-[var(--sea)]">
                  Registrar uno
                </Link>
                .
              </p>
            )}
          </div>
          <PlazoSugerirAi causaId={causa.id} />
        </section>

        <section id="documentos" className="panel case-destination rounded-[var(--radius-lg)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Documentos del expediente</h2>
            <div className="flex flex-wrap items-center gap-3">
              {connected && <CausaDocumentImportButton causaId={causa.id} />}
              <Link href={`/causas/${encodeURIComponent(causa.id)}/expediente`} className="btn btn-secondary">
                Organizar expediente
              </Link>
              <Link
                href={`/agente?causaId=${causa.id}&utility=doc_qa`}
                className="text-sm text-[var(--sea)]"
              >
                Preguntar con IA
              </Link>
              <Link href="/documentos" className="text-sm text-[var(--sea)]">
                Ver repositorio
              </Link>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {documentos.map((d) => (
              <div key={d.id} className="rounded-[var(--radius-md)] border border-[var(--line)] px-3 py-2 text-sm">
                <div className="font-medium">{d.nombre}</div>
                {d.ruta && (
                  <div className="text-xs text-[var(--muted)]">{d.ruta}/</div>
                )}
                <div className="text-xs text-[var(--muted)]">
                  {d.tipo} · v{d.version}
                  {d.extractionStatus === "completed" ? " · Texto preparado" : ["pending", "processing", "queued"].includes(d.extractionStatus || "") ? " · Preparando lectura" : d.extractionStatus === "failed" ? " · Revisar lectura" : ""}
                </div>
                <div className="mt-1 flex flex-wrap gap-3">
                  <Link
                    href={`/agente?causaId=${causa.id}&utility=doc_qa&documentoId=${d.id}`}
                    className="text-xs text-[var(--sea)]"
                  >
                    Preguntar IA
                  </Link>
                  <a
                    href={`/api/documentos/${d.id}/content`}
                    className="text-xs text-[var(--sea)]"
                  >
                    Descargar
                  </a>
                  {d.extractionStatus === "completed" && d.hasMarkdown && (
                    <a
                      href={`/api/documentos/${d.id}/markdown`}
                      className="text-xs text-[var(--sea)]"
                    >
                      Texto preparado
                    </a>
                  )}
                  <DocumentDriveAction
                    documentId={d.id}
                    googleDriveId={d.googleDriveId}
                    hasText={d.hasText}
                    hasBinary={d.hasBinary}
                  />
                </div>
                <Link href={`/offline.html?kind=documento&record=${d.id}`} className="inline-flex min-h-11 items-center text-sm text-[var(--sea)]">Sin conexión</Link>
                <DocumentoAiActions documentoId={d.id} causaId={causa.id} version={d.version} />
              </div>
            ))}
            {documentos.length === 0 && (
              <p className="text-sm text-[var(--muted)]">
                Sin documentos. Incorpore archivos o una carpeta investigativa abajo.
              </p>
            )}
          </div>
        </section>
      </div>

      {canUseKnowledge && <div id="audios" className="case-destination"><CaseAudioManager causaId={id} /></div>}

      <DocumentoIngestForm lockedCausaId={causa.id} compact />

      <div className="grid gap-4 lg:grid-cols-2">
        {causa.notas.length > 0 && <section className="panel rounded-[var(--radius-lg)] p-5">
          <h2 className="text-lg font-semibold">Notas</h2>
          <div className="mt-4 space-y-4">
            {causa.notas.map((n) => (
              <article key={n.id} className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-solid)] p-4">
                <h3 className="font-medium">{n.titulo}</h3>
                {can(user, "causa.write", { causaRol: access.causaRol }) && <Link href={`/offline.html?kind=nota&record=${n.id}`} className="btn btn-secondary">Sin conexión</Link>}
                <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-[var(--ink-soft)]/85">
                  {n.contenido}
                </pre>
              </article>
            ))}
          </div>
        </section>}

        <section id="actividad" className="panel case-destination rounded-[var(--radius-lg)] p-5">
          <h2 className="text-lg font-semibold">Actividad</h2>
          <div className="mt-4 space-y-3">
            {causa.actividades.map((a) => (
              <div key={a.id} className="border-b border-[var(--line)] pb-3 text-sm last:border-0">
                <div>{a.mensaje}</div>
                <div className="mt-1 text-xs text-[var(--muted)]">
                  {a.user?.name || "Sistema"} · {formatDateTime(a.createdAt)} · {a.tipo}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
      <details className="border-y border-[var(--line)] py-2">
        <summary className="min-h-11 cursor-pointer py-3 text-lg font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--sea)]">Equipo y gestión de la causa</summary>
        <div className="space-y-4 py-4">
          <div className="panel flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] px-5 py-4">
            <div>
              <div className="text-sm font-semibold">Facturación de la causa</div>
              <p className="text-sm text-[var(--muted)]">
                Horas, gastos y cuenta del cliente.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/facturacion/horas" className="btn btn-ghost">
                Horas
              </Link>
              <Link href="/facturacion/facturas" className="btn btn-secondary">
                Facturas
              </Link>
              <Link
                href={`/facturacion/cuenta-corriente${causa.clienteId ? `?clienteId=${causa.clienteId}` : ""}`}
                className="btn btn-primary"
              >
                Cuenta corriente
              </Link>
            </div>
          </div>

          <div className="panel flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] px-5 py-4">
            <div>
              <div className="text-sm font-semibold">{t("sites.causaPanel.title")}</div>
              <p className="text-sm text-[var(--muted)]">
                {causa.site ? t("sites.causaPanel.hasSite") : t("sites.causaPanel.noSite")}
              </p>
              {causa.site && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="badge badge-ink">{siteTipoLabel(dict, causa.site.tipo)}</span>
                  {causa.site.isClientVisible && (
                    <span className="badge badge-sea">{t("siteTabs.portalVisible")}</span>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {causa.site ? (
                <Link href={`/sites/${causa.site.id}`} className="btn btn-primary">
                  {t("sites.causaPanel.openSite")}
                </Link>
              ) : (
                <CreateSiteFromCausaButton
                  causaId={causa.id}
                  clienteId={causa.clienteId}
                  suggestedName={causa.rit ? `${causa.rit} · ${causa.titulo}` : causa.titulo}
                  isAdmin={user.role === "admin"}
                />
              )}
            </div>
          </div>

          <CausaEquipoPanel
            causaId={causa.id}
            initialAcceso={causa.acceso}
            initialMiembros={causa.miembros.map((m) => ({
              id: m.id,
              userId: m.userId,
              rol: m.rol,
              user: {
                id: m.user.id,
                name: m.user.name,
                email: m.user.email,
                role: m.user.role,
              },
            }))}
            staffOptions={responsables}
            canManage={can(user, "causa.team.manage", {
              causaRol: access.causaRol,
            })}
          />

          {!["warning", "blocked"].includes(causa.conflictStatus) && <ConflictReviewPanel
            causaId={causa.id}
            status={causa.conflictStatus}
            notes={causa.conflictNotes}
          />}

        </div>
      </details>
    </div>
  );
}
