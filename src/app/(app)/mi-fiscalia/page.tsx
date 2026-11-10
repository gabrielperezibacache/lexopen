import { requireStaff } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui/PageHeader";
import { FiscaliaWorkspace, type FiscaliaItem } from "@/components/fiscalia/FiscaliaWorkspace";
import { fiscaliaWorkspace } from "@/lib/fiscalia/service";
import { FISCALIA_STATUSES, FISCALIA_HELP } from "@/lib/fiscalia/contract";
import { notFound } from "next/navigation";
export default async function Page({ searchParams }: { searchParams: Promise<{ causaId?: string; status?: string }> }) {
  const user = await requireStaff(), query = await searchParams;
  if (query.causaId && (typeof query.causaId !== "string" || query.causaId.length > 120)) notFound();
  const status = ["open", "all", ...Object.keys(FISCALIA_STATUSES)].includes(query.status || "") ? query.status! : "open";
  const workspace = await fiscaliaWorkspace(user, { causaId: query.causaId, status }).catch(error => { if (error.status === 404) notFound(); throw error; });
  return <div className="space-y-6"><PageHeader title="Mi Fiscalía" subtitle="Solicitudes, folios y seguimiento vinculados a tus causas." actions={<a className="btn btn-ghost" href={FISCALIA_HELP} target="_blank" rel="noopener noreferrer">Ayuda oficial de Fiscalía</a>} /><FiscaliaWorkspace rows={JSON.parse(JSON.stringify(workspace.rows)) as FiscaliaItem[]} causes={workspace.causes} truncated={workspace.truncated} userId={user.id} causaId={query.causaId} status={status} /></div>;
}
