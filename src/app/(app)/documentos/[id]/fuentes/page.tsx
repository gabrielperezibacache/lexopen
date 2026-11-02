import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { authorizedEvidenceDocument } from "@/lib/evidence/service";
import { PageHeader } from "@/components/ui/PageHeader";
import { DocumentEvidenceReader } from "@/components/DocumentEvidenceReader";

export default async function DocumentSourcesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ version?: string; after?: string }> }) {
  const user = await requireStaff(); const { id } = await params; const sp = await searchParams;
  let doc;
  try { doc = await authorizedEvidenceDocument(id, user); }
  catch (e) { if ((e as { status?: number }).status === 404) notFound(); throw e; }
  const after = Number(sp.after || 0);
  return <div className="space-y-6">
    <Link href="/documentos" className="text-sm text-[var(--sea)]">Volver a documentos</Link>
    <PageHeader title={doc.nombre} subtitle={<p className="text-[var(--ink-soft)]">Fuentes del documento. Consulte el texto registrado, abra el original y copie una referencia a la versión revisada.</p>} />
    <DocumentEvidenceReader documentId={id} initialVersion={sp.version || ""} initialAfter={Number.isSafeInteger(after) && after >= 0 ? after : 0} />
  </div>;
}
