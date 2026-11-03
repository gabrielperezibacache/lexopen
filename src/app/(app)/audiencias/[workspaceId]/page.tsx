import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { HearingWorkbench } from "@/components/hearings/HearingWorkbench";
import { CaseAudioManager } from "@/components/audio/CaseAudioManager";
import { CaseWorkflowNav } from "@/components/causas/CaseWorkflowNav";
import { requireStaff } from "@/lib/auth/session";
import { actorFor } from "@/lib/books/access";
import { workspaceFor } from "@/lib/hearings/access";
import { prisma } from "@/lib/db";

export const metadata = { title: "Audiencia en vivo · LexOpen" };

export default async function IndependentHearingPage({ params, searchParams }: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ nota?: string }>;
}) {
  const actor = await actorFor(await requireStaff()), { workspaceId } = await params;
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(workspaceId)) notFound();
  const desk = await prisma.hearingWorkspace.findFirst({ where: { id: workspaceId, ownerId: actor.id }, select: { causaId: true } });
  if (!desk) notFound();
  await workspaceFor(desk.causaId, workspaceId, actor).catch(() => notFound());
  const causa = await prisma.causa.findUnique({ where: { id: desk.causaId }, select: { titulo: true, rit: true, tribunal: true } });
  if (!causa) notFound();
  const query = await searchParams, noteId = query.nota && /^[a-zA-Z0-9_-]{1,100}$/.test(query.nota) ? query.nota : undefined;
  return <div className="hearing-session-page">
    <header className="hearing-session-heading"><div><h1>Audiencia en vivo</h1><p>{causa.titulo} · {causa.rit || "Sin RIT"} · {causa.tribunal}</p></div><Link href="/audiencias"><ArrowLeft size={17} aria-hidden="true" />Todas mis audiencias</Link></header>
    <CaseWorkflowNav causaId={desk.causaId} title={causa.titulo} current="hearing" workspaceId={workspaceId} />
    <HearingWorkbench causaId={desk.causaId} initialWorkspaceId={workspaceId} initialNoteId={noteId} initialPanel="live" independent />
    <details className="hearing-session-audio"><summary>Grabaciones y transcripciones de la causa</summary><CaseAudioManager causaId={desk.causaId} /></details>
  </div>;
}
