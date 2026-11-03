import Link from "next/link";
import { notFound } from "next/navigation";
import { HearingWorkbench } from "@/components/hearings/HearingWorkbench";
import { CaseAudioManager } from "@/components/audio/CaseAudioManager";
import { requireStaff } from "@/lib/auth/session";
import { assertCausaAccess } from "@/lib/auth/causa-access";
import { actorFor } from "@/lib/books/access";
import { prisma } from "@/lib/db";
import { CaseWorkflowNav } from "@/components/causas/CaseWorkflowNav";

export const metadata = { title: "Mesa de audiencia · LexOpen" };

export default async function HearingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ mesa?: string; nota?: string }> }) {
  const user = await actorFor(await requireStaff());
  const { id } = await params;
  const query = await searchParams;
  const validId = (value?: string) => value && /^[a-zA-Z0-9_-]{1,100}$/.test(value) ? value : undefined;
  await assertCausaAccess(id, user).catch(() => notFound());
  const causa = await prisma.causa.findUnique({ where: { id }, select: { titulo: true, rit: true, tribunal: true } });
  if (!causa) notFound();
  return <div className="space-y-6"><CaseWorkflowNav causaId={id} title={causa.titulo} current="hearing" /><header><Link className="text-sm text-[var(--sea)]" href={`/causas/${id}`}>Volver a la carpeta de la causa</Link><h1 className="display text-3xl mt-3">Mesa de audiencia</h1><p className="text-[var(--ink-soft)] mt-2 break-words">{causa.titulo} · {causa.rit || "Sin RIT"} · {causa.tribunal}</p></header><HearingWorkbench causaId={id} initialWorkspaceId={validId(query.mesa)} initialNoteId={validId(query.nota)} /><CaseAudioManager causaId={id} /></div>;
}
