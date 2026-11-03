import Link from "next/link";
import { notFound } from "next/navigation";
import { CaseWritingEditor } from "@/components/writings/CaseWritingEditor";
import { requireStaff } from "@/lib/auth/session";
import { assertCausaAccess } from "@/lib/auth/causa-access";
import { actorFor } from "@/lib/books/access";
import { prisma } from "@/lib/db";
import { CaseWorkflowNav } from "@/components/causas/CaseWorkflowNav";

export const metadata = { title: "Escritos de la causa · LexOpen" };

export default async function WritingsPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ draft?: string; fuentes?: string; libro?: string }>;
}) {
  const user = await actorFor(await requireStaff()), { id } = await params, query = await searchParams;
  await assertCausaAccess(id, user, { auditOverride: false }).catch(() => notFound());
  const causa = await prisma.causa.findUnique({ where: { id }, select: { titulo: true, rit: true, tribunal: true } });
  if (!causa) notFound();
  const initialSources = query.fuentes === "note" ? "note" : query.fuentes === "book" ? "book" : "fact";
  return <div className="writing-page">
    <CaseWorkflowNav causaId={id} title={causa.titulo} current="writing" />
    <header className="writing-page-heading"><div>
      <Link className="writing-back" href={"/causas/" + id}>Volver a la carpeta de la causa</Link>
      <h1>Escritos de la causa</h1>
      <p>{causa.titulo} · {causa.rit || "Sin RIT"} · {causa.tribunal}</p>
    </div><Link className="writing-text-link" href={"/causas/" + id + "/audiencias"}>Abrir mesa de audiencia</Link></header>
    <CaseWritingEditor causaId={id} initialDraftId={query.draft && /^[a-zA-Z0-9_-]{1,100}$/.test(query.draft) ? query.draft : ""} initialSources={initialSources} initialBookId={query.libro && /^[a-zA-Z0-9_-]{1,100}$/.test(query.libro) ? query.libro : ""} />
  </div>;
}
