import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { bookFor } from "@/lib/books/access";
import { BookReader } from "@/components/books/BookReader";
import { CaseWorkflowNav } from "@/components/causas/CaseWorkflowNav";
import { caseWorkflowContext, workflowDraftId } from "@/lib/causas/workflow-context";

export const metadata = { title: "Lectura y fuentes · LexOpen" };

export default async function LibraryBookPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ causa?: string; escrito?: string }> }) {
  const user = await requireStaff(), { id } = await params;
  const { actor } = await bookFor(id, user).catch(error => { if ((error as { status?: number }).status === 404) notFound(); throw error; });
  const query = await searchParams, causa = await caseWorkflowContext(query.causa, actor);
  return <div className="space-y-6">{causa && <CaseWorkflowNav causaId={causa.id} title={causa.titulo} current="library" />}<BookReader bookId={id} causaId={causa?.id} writingDraftId={causa ? workflowDraftId(query.escrito) : undefined} /></div>;
}
