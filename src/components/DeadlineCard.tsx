import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { can } from "@/lib/auth/permissions";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
import { deadlineVersion } from "@/lib/deadlines/completion";
import { deadlineHref } from "@/lib/deadlines/navigation";
import { formatCivilDate } from "@/lib/chile-time";
import { diasRestantes, labelDiasRestantes, labelTipoComputo } from "@/lib/plazos";
import { DeadlineActions } from "@/components/DeadlineActions";
import { PlazoGoogleButton } from "@/components/PlazoGoogleButton";
import { CivilDeadlineDetails } from "@/components/CivilDeadlineDetails";
import { StatusBadge, UrgenciaBadge } from "@/components/ui";

export function deadlineCardRelations(userId: string) {
  const now = new Date();
  return {
    causa: { select: { id: true, titulo: true, rit: true, abogadoId: true, miembros: {
      where: { userId, desde: { lte: now }, OR: [{ hasta: null }, { hasta: { gt: now } }] }, select: { rol: true },
    } } },
    responsable: { select: { name: true } },
  } satisfies Prisma.PlazoInclude;
}

type Deadline = Prisma.PlazoGetPayload<{ include: ReturnType<typeof deadlineCardRelations> }>;
type Labels = { fatal: string; noCause: string; noOwner: string };

export function DeadlineCard({ deadline: p, user, labels: h, returnTo }: { deadline: Deadline; user: CausaAccessUser; labels: Labels; returnTo?: string }) {
  const memberRole = p.causa?.miembros[0]?.rol;
  const scope = p.causa ? { causaRol: p.causa.abogadoId === user.id ? "responsable" : memberRole } : { own: p.responsableId === user.id };
  const readOnly = memberRole === "lectura" && p.causa?.abogadoId !== user.id && !can(user, "causa.write");
  return (
    <div
      id={`plazo-${p.id}`}
      className="panel scroll-mt-24 target:outline flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-xl)] px-5 py-4"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {returnTo ? <h2 className="break-words font-semibold"><Link prefetch={false} href={deadlineHref(p.id, returnTo)} className="text-[var(--sea)] hover:underline">{p.titulo}</Link></h2>
            : <h1 className="break-words text-2xl font-semibold">{p.titulo}</h1>}
          <StatusBadge estado={p.estado} />
          {(p.estado !== "vencido" || diasRestantes(p.fechaLimite) >= 0) && <UrgenciaBadge fecha={p.fechaLimite} estado={p.estado} />}
          {p.esFatal && (
            <span className="badge badge-vencido">{h.fatal}</span>
          )}
        </div>
        <p className="mt-1 break-words text-sm text-[var(--muted)]">
          {formatCivilDate(p.fechaLimite)} ·{" "}
          {labelTipoComputo(p.tipoComputo, p.calculationRegime)}
          {p.estado === "pendiente"
            ? ` · ${labelDiasRestantes(diasRestantes(p.fechaLimite))}`
            : ""}{" "}
          ·{" "}
          {p.causa ? (
            <Link
              href={`/causas/${p.causa.id}`}
              className="text-[var(--sea)]"
            >
              {p.causa.rit || p.causa.titulo}
            </Link>
          ) : (
            h.noCause
          )}{" "}
          · {p.responsable?.name || h.noOwner}
        </p>
        {p.civilCalculationBasis != null && <CivilDeadlineDetails value={p.civilCalculationBasis} currentRegime={p.calculationRegime} />}
        {p.descripcion && (
          <p className="mt-2 text-sm text-[var(--muted)]">
            {p.descripcion}
          </p>
        )}
      </div>
      <DeadlineActions
        id={p.id}
        estado={p.estado}
        version={deadlineVersion(p)}
        causaId={p.causaId}
        canEdit={!readOnly && can(user, "plazo.edit", scope)}
        canClose={!readOnly && can(user, "plazo.close", scope)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/offline.html?kind=plazo&record=${p.id}`}
          className="btn btn-secondary"
        >
          Sin conexión
        </Link>
        <PlazoGoogleButton plazoId={p.id} />
      </div>
    </div>
  );
}
