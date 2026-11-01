import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { authorizedEvidenceSiteFile } from "@/lib/evidence/service";
import { PageHeader } from "@/components/ui/PageHeader";
import { DocumentEvidenceReader } from "@/components/DocumentEvidenceReader";

export default async function SiteFileSourcesPage({ params, searchParams }: { params: Promise<{ id: string; fileId: string }>; searchParams: Promise<{ version?: string; after?: string; page?: string }> }) {
  const user = await requireStaff(); const { id, fileId } = await params; const sp = await searchParams;
  let file;
  try { file = await authorizedEvidenceSiteFile(id, fileId, user); }
  catch (error) { if ((error as { status?: number }).status === 404) notFound(); throw error; }
  const after = Number(sp.after || 0);
  return <div className="space-y-6">
    <Link href={`/sites/${id}/archivos`} className="text-sm text-[var(--sea)]">Volver a archivos del espacio</Link>
    <PageHeader title={file.name} subtitle={<p className="text-[var(--ink-soft)]">Fuentes del archivo del espacio. Consulte el texto registrado y su original conservado; cada referencia identifica la versión revisada.</p>} />
    <DocumentEvidenceReader documentId={fileId} siteId={id} initialVersion={sp.version || ""} initialAfter={Number.isSafeInteger(after) && after >= 0 ? after : 0} initialPage={sp.page && /^[1-9]\d{0,2}$/.test(sp.page) ? Number(sp.page) : undefined} />
  </div>;
}
