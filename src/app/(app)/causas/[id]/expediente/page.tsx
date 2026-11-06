import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Cloud, FileSearch, Folder, Search } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { CaseArchiveOrganizer } from "@/components/causas/CaseArchiveOrganizer";
import { CaseDocumentNews } from "@/components/causas/CaseDocumentNews";
import { DocumentoIngestForm } from "@/components/DocumentoIngestForm";
import { DriveFolderPanel } from "@/components/DriveFolderPanel";
import { CausaDocumentImportButton } from "@/components/pjud/CausaDocumentImportButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireStaffPage } from "@/lib/auth/access";
import { assertCausaAccess, causaAccessWhere, documentReadWhere } from "@/lib/auth/causa-access";
import { can, canSome } from "@/lib/auth/permissions";
import { getCaseManagementMode } from "@/lib/causas/management-mode";
import { listCaseUpdates } from "@/lib/causas/updates";
import { validarRit } from "@/lib/chile";
import { prisma } from "@/lib/db";
import { getI18n } from "@/lib/i18n/server";
import { isRealDriveFolderId } from "@/lib/integrations/drive-folder";

type Params = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ carpeta?: string; q?: string; origen?: string; pagina?: string; vista?: string; antes?: string }>;
};

const pageSize = 40;

export default async function CaseArchivePage({ params, searchParams }: Params) {
  const [user, { id }, filters] = await Promise.all([requireStaffPage(), params, searchParams]);
  const access = await assertCausaAccess(id, user).catch(error => {
    if ((error as { status?: number }).status === 404) notFound();
    throw error;
  });
  const canWrite = can(user, "causa.write", { causaRol: access.causaRol });
  const canAsk = canSome(user, "assistant.use");
  const [causa, { locale }] = await Promise.all([
    prisma.causa.findFirst({
      where: { AND: [{ id }, causaAccessWhere(user)] },
      select: { titulo: true, rit: true, tribunal: true, googleDriveFolderId: true, googleDriveFolderName: true, googleDriveFolderUrl: true, driveSyncSubscription: { select: { account: true } } },
    }),
    getI18n(),
  ]);
  if (!causa) notFound();
  const tr = (es: string, en: string) => locale === "en" ? en : es;
  const base = `/causas/${encodeURIComponent(id)}/expediente`;
  const newsHref = `${base}?vista=novedades`;
  const isNews = filters.vista === "novedades";
  const assistant = (documentoId?: string) => `/inicio?${new URLSearchParams({
    causaId: id,
    ...(documentoId ? { documentoId } : {}),
    intencion: documentoId
      ? "Ayúdame a revisar este documento y cita los pasajes que respaldan tus observaciones."
      : "Ayúdame a revisar este expediente y cita los pasajes que respaldan tus observaciones.",
  })}`;
  const heading = <PageHeader title={causa.titulo} subtitle={[causa.rit, causa.tribunal].filter(Boolean).join(" · ")} actions={<>
    <Link href={`/causas/${encodeURIComponent(id)}#ficha`} className="btn btn-ghost" aria-label="Ficha de la causa">
      <span>Ficha<span className="hidden sm:inline"> de la causa</span></span>
    </Link>
    {canAsk && <Link href={assistant()} className="btn btn-secondary" aria-label="Consultar expediente"><FileSearch size={17} aria-hidden="true" />
      <span>Consultar<span className="hidden sm:inline"> expediente</span></span>
    </Link>}
  </>} />;
  const archiveViews = [
    { url: base, label: tr("Carpetas y documentos", "Folders and documents"), current: !isNews },
    { url: newsHref, label: tr("Novedades", "Updates"), current: isNews },
  ];
  const tabs = (
    <nav className="flex flex-wrap gap-x-5 border-b border-[var(--line)]" aria-label={tr("Vistas del expediente", "Case file views")}>
      {archiveViews.map(({ url, label, current }) => (
        <Link key={url} href={url} aria-current={current ? "page" : undefined}
          className={`inline-flex min-h-11 items-center border-b-2 px-1 text-sm font-medium hover:text-[var(--sea)] ${current ? "border-[var(--sea)] text-[var(--sea)]" : "border-transparent text-[var(--ink-soft)]"}`}>{label}</Link>
      ))}
    </nav>
  );
  if (isNews) {
    const before = typeof filters.antes === "string" ? filters.antes : null;
    const feed = await listCaseUpdates(id, user, { before }).catch(error => {
      if ((error as { status?: number }).status === 404) notFound();
      if ((error as { status?: number }).status === 400) redirect(newsHref);
      throw error;
    });
    return <div className="mx-auto max-w-6xl space-y-5" data-testid="case-archive">
      {heading}
      {tabs}
      <CaseDocumentNews feed={feed} archiveHref={base} newsHref={newsHref} older={Boolean(before)} canWrite={canWrite} locale={locale} />
    </div>;
  }

  const [folders, managementMode] = await Promise.all([
    prisma.caseDocumentFolder.findMany({ where: { causaId: id, causa: causaAccessWhere(user) }, orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true, parentId: true } }),
    getCaseManagementMode(),
  ]);

  const byId = new Map(folders.map(folder => [folder.id, folder]));
  function pathFor(folderId: string) {
    const path: typeof folders = [];
    const seen = new Set<string>();
    for (let folder = byId.get(folderId); folder && !seen.has(folder.id); folder = folder.parentId ? byId.get(folder.parentId) : undefined) {
      seen.add(folder.id);
      path.unshift(folder);
    }
    return path;
  }
  const folderId = typeof filters.carpeta === "string" && byId.has(filters.carpeta) ? filters.carpeta : null;
  const folder = folderId ? byId.get(folderId)! : null;
  const trail = folderId ? pathFor(folderId) : [];
  const q = typeof filters.q === "string" ? filters.q.trim().slice(0, 120) : "";
  const savedOjv = { causaId: id, status: "saved" };
  const ojvIntake = { causaId: id, source: "ojv" };
  const pjud: Prisma.DocumentoWhereInput = { OR: [
    { pjudDocumentJobs: { some: savedOjv } },
    { caseIntakes: { some: ojvIntake } },
    { storageKey: { not: null, startsWith: "pjud/" } },
  ] };
  const drive: Prisma.DocumentoWhereInput = { driveImport: { is: { causaId: id } } };
  const lexopen: Prisma.DocumentoWhereInput = { OR: [
    { NOT: [pjud, drive] },
    { caseIntakes: { some: { causaId: id, source: { in: ["manual", "mail"] } } } },
    { storageKey: { startsWith: "documentos/" } },
    { storageKey: { startsWith: "correo/" } },
  ] };
  const origins: Record<string, Prisma.DocumentoWhereInput> = { pjud, drive, lexopen };
  const origin = typeof filters.origen === "string" && Object.hasOwn(origins, filters.origen) ? filters.origen : "";
  const page = Math.min(5000, Math.max(1, Number.parseInt(String(filters.pagina), 10) || 1));
  function href(next: { folderId?: string | null; page?: number; preserve?: boolean } = {}) {
    const query = new URLSearchParams();
    const selected = next.folderId === undefined ? folderId : next.folderId;
    if (selected) query.set("carpeta", selected);
    if (next.preserve) {
      if (q) query.set("q", q);
      if (origin) query.set("origen", origin);
    }
    if (next.page && next.page > 1) query.set("pagina", String(next.page));
    return query.size ? `${base}?${query}` : base;
  }
  const where: Prisma.DocumentoWhereInput = { AND: [
    documentReadWhere(user),
    { causaId: id },
    ...(origin ? [origins[origin]] : []),
    q ? { OR: [{ nombre: { contains: q, mode: "insensitive" } }, { ruta: { contains: q, mode: "insensitive" } }] }
      : { archivePlacement: folderId ? { is: { folderId } } : { is: null } },
  ] };
  const [total, documents] = await Promise.all([
    prisma.documento.count({ where }),
    prisma.documento.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, nombre: true, ruta: true, storageKey: true, googleDriveId: true, extractionStatus: true, confidencial: true, privilegio: true,
        archivePlacement: { select: { folderId: true } },
        driveImport: { select: { causaId: true } },
        pjudDocumentJobs: { where: savedOjv, take: 1, select: { id: true } },
        caseIntakes: { where: ojvIntake, take: 1, select: { id: true } },
      },
    }),
  ]);
  const destinations = folders.map(value => {
    const path = pathFor(value.id);
    return { id: value.id, path: path.map(item => item.name).join(" / "), ancestorIds: path.slice(0, -1).map(item => item.id) };
  });
  const destinationNames = new Map(destinations.map(value => [value.id, value.path]));
  const studyDriveFolderId = (!causa.driveSyncSubscription || causa.driveSyncSubscription.account === "study") &&
    isRealDriveFolderId(causa.googleDriveFolderId) ? causa.googleDriveFolderId : null;
  const rows = documents.map(document => {
    const fromDrive = document.driveImport?.causaId === id;
    const fromPjud = Boolean(document.pjudDocumentJobs.length || document.caseIntakes.length || document.storageKey?.startsWith("pjud/"));
    return {
      id: document.id, name: document.nombre, route: document.ruta, status: document.extractionStatus,
      folder: document.archivePlacement ? destinationNames.get(document.archivePlacement.folderId) || null : null,
      source: fromDrive && fromPjud ? "Google Drive y OJV" : fromDrive ? "Importado de Drive" : fromPjud ? "Descargado de OJV" : "LexOpen",
      hasStudyCopy: Boolean(studyDriveFolderId && document.googleDriveId),
      copyToStudyFolderId: canWrite && document.storageKey && !fromDrive && !document.googleDriveId && !document.confidencial && !document.privilegio ? studyDriveFolderId : null,
      assistantHref: canAsk ? assistant(document.id) : null,
    };
  });
  const children = folders.filter(value => value.parentId === folderId);

  return <div className="mx-auto max-w-6xl space-y-5" data-testid="case-archive">
    {heading}
    {tabs}
    <nav aria-label="Ubicación en Mis Causas" className="flex flex-wrap items-baseline gap-x-2 text-xs sm:text-sm">
      <Link className="inline-flex min-h-11 items-center text-[var(--sea)]" href="/mis-causas">Mis Causas</Link>
      <span aria-hidden="true">/</span>
      {folder ? <Link className="inline-flex min-h-11 items-center text-[var(--sea)]" href={base}>Expediente</Link> : <span aria-current="location">Expediente</span>}
      {trail.map(item => <span key={item.id} className="min-w-0 break-words">
        <span aria-hidden="true" className="mr-2">/</span>
        {item.id === folderId ? <span aria-current="location">{item.name}</span> : <Link className="inline-flex min-h-11 items-center text-[var(--sea)]" href={href({ folderId: item.id })}>{item.name}</Link>}
      </span>)}
    </nav>

    <section className="panel space-y-4 rounded-[var(--radius-lg)] p-4 sm:p-5" aria-labelledby="archive-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="archive-title" className="break-all text-lg font-semibold">{folder?.name || "Carpetas y documentos"}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {canWrite && <a className="btn btn-secondary" href="#incorporar-documentos">Añadir archivos</a>}
          <a className="btn btn-ghost" href="#drive-del-expediente" aria-label="Google Drive"><Cloud size={17} aria-hidden="true" />
            <span><span className="hidden sm:inline">Google </span>Drive</span>
          </a>
        </div>
      </div>
      <form action={base} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-2">
        {folderId && <input type="hidden" name="carpeta" value={folderId} />}
        <label className="grid min-w-0 gap-1.5 text-sm font-medium">
          Buscar en el expediente
          <input className="input min-w-0" type="search" name="q" placeholder="Nombre o carpeta de origen" maxLength={120} defaultValue={q} />
        </label>
        <button className="btn btn-secondary" aria-label="Buscar" type="submit"><Search size={17} aria-hidden="true" /><span className="hidden sm:inline">Buscar</span></button>
        <details className="col-span-2" open={Boolean(origin)}>
          <summary className="min-h-11 cursor-pointer py-3 text-sm text-[var(--sea)]">Filtrar por origen</summary>
          <div className="flex flex-wrap items-end gap-2 pb-2">
            <label className="grid min-w-0 gap-1.5 text-sm font-medium">
              Origen
              <select className="select min-w-0" name="origen" defaultValue={origin}>
                <option value="">Todos</option>
                <option value="lexopen">LexOpen</option>
                <option value="pjud">Oficina Judicial Virtual</option>
                <option value="drive">Importados de Drive</option>
              </select>
            </label>
            <button className="btn btn-ghost" type="submit">Aplicar filtro</button>
          </div>
        </details>
      </form>
      {(q || origin) && <Link className="inline-flex min-h-11 items-center text-sm text-[var(--sea)]" href={href()}>Quitar filtros</Link>}
      {!q && children.length > 0 && <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]" aria-label="Carpetas">
        {children.map(item => <li key={item.id}><Link className="flex min-h-12 items-center gap-2 py-2 text-sm font-medium text-[var(--sea)]" href={href({ folderId: item.id })}>
          <Folder size={18} className="shrink-0" aria-hidden="true" /><span className="min-w-0 break-all">{item.name}</span>
        </Link></li>)}
      </ul>}

      <CaseArchiveOrganizer key={href({ page, preserve: true })} causaId={id} folder={folder} folders={destinations}
        canWrite={canWrite} documents={rows} showPlacement={Boolean(q)} />

      {total > pageSize && <nav aria-label="Páginas de documentos" className="flex flex-wrap items-center gap-3 text-sm">
        {page > 1 && <Link className="btn btn-ghost" href={href({ page: page - 1, preserve: true })}>Anterior</Link>}
        <span>Página {page} de {Math.ceil(total / pageSize)}</span>
        {page * pageSize < total && <Link className="btn btn-ghost" href={href({ page: page + 1, preserve: true })}>Siguiente</Link>}
      </nav>}
    </section>
    {canWrite && <section id="incorporar-documentos" aria-label="Incorporar archivos" className="space-y-3 scroll-mt-24">
      <DocumentoIngestForm key={folderId || "root"} lockedCausaId={id} compact allowDriveCopy={false} destinationFolder={folder || undefined} />
      {managementMode === "pjud_cl" && causa.rit && validarRit(causa.rit) && <CausaDocumentImportButton causaId={id} />}
    </section>}
    <details id="drive-del-expediente" className="panel scroll-mt-24 rounded-[var(--radius-lg)] px-4">
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">Archivos de Google Drive</summary>
      <DriveFolderPanel canImport={canWrite} causaId={id} folderId={causa.googleDriveFolderId} folderName={causa.googleDriveFolderName} folderUrl={causa.googleDriveFolderUrl} />
    </details>
  </div>;
}
