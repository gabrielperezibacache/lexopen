import Link from "next/link";
import { Suspense } from "react";
import { AltazorHome } from "@/components/altazor/AltazorHome";
import { buildInicioStatus } from "@/lib/assistant/status";
import { requireStaff } from "@/lib/auth/session";
import { canSome } from "@/lib/auth/permissions";

async function UrgentDeadlines({ user }: { user: Awaited<ReturnType<typeof requireStaff>> }) {
  const status = await buildInicioStatus(user, new Date());
  if (!status.plazosFatalesProximos) return null;
  return <p role="status" className="altazor-urgent" data-testid="inicio-status-line"><Link href="/plazos">{status.plazosFatalesProximos === 1 ? "Tienes un plazo fatal próximo. Revísalo." : `Tienes ${status.plazosFatalesProximos} plazos fatales próximos. Revísalos.`}</Link></p>;
}

export default async function InicioPage() {
  const user = await requireStaff();
  return <div className="inicio-altazor-page">
    <h1 className="sr-only">ALTAZOR</h1>
    {canSome(user, "assistant.use") ? <AltazorHome showDesktopActivity /> : <>
      <div className="flex flex-wrap gap-3"><Link className="btn btn-primary" href="/causas">Abrir causas</Link><Link className="btn btn-outline" href="/calendario">Ver agenda</Link></div>
      <Suspense fallback={null}><UrgentDeadlines user={user} /></Suspense>
    </>}
  </div>;
}
