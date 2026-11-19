import Link from "next/link";
import { requireStaff } from "@/lib/auth/session";
import { listJudgmentsAwaitingRecovery } from "@/lib/research/service";
import { PageHeader } from "@/components/ui/PageHeader";
import { PjudRecoverPublicCopy } from "@/components/PjudRecoverPublicCopy";

export default async function Page({ searchParams }: { searchParams: Promise<{ after?: string }> }) {
  const user = await requireStaff();
  const { after } = await searchParams;
  const page = await listJudgmentsAwaitingRecovery(user, after);
  return <div className="space-y-5">
    <Link href="/jurisprudencia" className="text-sm text-[var(--sea)]">Volver a jurisprudencia</Link>
    <PageHeader title="Sentencias pendientes de recuperar" subtitle="Las copias históricas quedan bajo custodia del Host. Recupere el texto público de cada fallo antes de cotejar sus citas." />
    {page.items.length === 0 && <p>No hay sentencias pendientes en esta página.</p>}
    <ul className="divide-y divide-[var(--line)]">{page.items.map(item =>
      <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
        <span>{item.judgmentId ? `Sentencia PJUD ${item.judgmentId}` : "Sentencia sin identificador público comprobable"}</span>
        {item.judgmentId && <PjudRecoverPublicCopy id={item.judgmentId} />}
      </li>
    )}</ul>
    <nav aria-label="Páginas de revisión" className="flex gap-3">
      {after && <Link className="btn btn-secondary" href="/jurisprudencia/revision">Primera página</Link>}
      {page.next && <Link className="btn btn-secondary" href={`/jurisprudencia/revision?after=${encodeURIComponent(page.next)}`}>Siguiente página</Link>}
    </nav>
  </div>;
}
