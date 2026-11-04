import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { writingActor } from "@/lib/writings/access";
import { prisma } from "@/lib/db";
import { CaseWorkflowNav } from "@/components/causas/CaseWorkflowNav";
import { CaseWorkbench } from "@/components/workbench/CaseWorkbench";
export const metadata = { title: "Mesa del asistente · LexOpen" };
export default async function CaseWorkbenchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await writingActor(id, await requireStaff()).catch(() => notFound());
  const cause = await prisma.causa.findUnique({ where: { id }, select: { titulo: true, rit: true, tribunal: true } });
  if (!cause) notFound();
  return <div className="workbench-page"><CaseWorkflowNav causaId={id} title={cause.titulo} current="workbench" /><header className="workbench-heading"><Link href={`/causas/${id}#preparacion`}>Volver a preparar la causa</Link><h1>Mesa del asistente</h1><p>{cause.titulo} · {cause.rit || "Sin RIT"} · {cause.tribunal}</p></header><CaseWorkbench causaId={id} /></div>;
}
