import { requireStaff } from "@/lib/auth/session";
import { actorFor } from "@/lib/books/access";
import { Bookshelf } from "@/components/books/Bookshelf";
import { CaseWorkflowNav } from "@/components/causas/CaseWorkflowNav";
import { caseWorkflowContext, workflowDraftId } from "@/lib/causas/workflow-context";

export const metadata = { title: "Mi biblioteca jurídica · LexOpen" };

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ fuentes?: string; causa?: string; escrito?: string; personalizar?: string }> }) {
  const user = await actorFor(await requireStaff());
  const query = await searchParams, causa = await caseWorkflowContext(query.causa, user);
  return <div className="space-y-6">
    {causa && <CaseWorkflowNav causaId={causa.id} title={causa.titulo} current="library" />}
    {causa && <p className="text-sm text-[var(--ink-soft)]">Consulta tus libros para esta causa. Abrir un volumen no lo comparte con el equipo; los pasajes se incorporan al escrito sólo cuando los eliges.</p>}
    <Bookshelf userName={user.name} initialJudicial={query.fuentes === "judicial"} initialPersonalization={query.personalizar === "1"} causaId={causa?.id} writingDraftId={causa ? workflowDraftId(query.escrito) : undefined} />
  </div>;
}
