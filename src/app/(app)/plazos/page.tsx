import { prisma } from "@/lib/db";
import { StatusBadge, formatDate } from "@/components/ui";
import Link from "next/link";
import { PlazoGoogleButton } from "@/components/PlazoGoogleButton";
import { PlazoForm } from "@/components/PlazoForm";
import { publicUserSelect } from "@/lib/auth/public-user";
import { requireStaff } from "@/lib/auth/session";

type Props = { searchParams: Promise<{ mes?: string }> };

function monthBounds(value?: string) {
  const now = new Date();
  const match = value?.match(/^(\d{4})-(\d{2})$/);
  const year = match ? Number(match[1]) : now.getFullYear();
  const month = match ? Number(match[2]) - 1 : now.getMonth();
  const start = new Date(year, month, 1, 0, 0, 0, 0);
  const end = new Date(year, month + 1, 1, 0, 0, 0, 0);
  return { start, end };
}

function monthParam(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export default async function PlazosPage({ searchParams }: Props) {
  await requireStaff();
  const sp = await searchParams;
  const { start, end } = monthBounds(sp.mes);
  const [plazos, causas, responsables] = await Promise.all([
    prisma.plazo.findMany({
      where: { fechaLimite: { gte: start, lt: end } },
      include: { causa: true, responsable: { select: publicUserSelect } },
      orderBy: { fechaLimite: "asc" },
    }),
    prisma.causa.findMany({
      where: { estado: { in: ["activa", "suspensa"] } },
      select: { id: true, rit: true, titulo: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    prisma.user.findMany({
      where: { role: { in: ["admin", "abogado", "asistente"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const prev = new Date(start.getFullYear(), start.getMonth() - 1, 1);
  const next = new Date(start.getFullYear(), start.getMonth() + 1, 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--sea)]">
            Gestión de términos
          </p>
          <h1 className="display mt-2 text-4xl">Plazos</h1>
          <p className="mt-2 text-[var(--ink-soft)]/80">
            Plazos procesales, audiencias e internos. Envíelos a Google Calendar con un clic.
          </p>
        </div>
        <Link className="btn btn-secondary" href="/agente?utility=plazos">
          Analizar con copiloto
        </Link>
      </div>

      <PlazoForm
        causas={causas.map((c) => ({ id: c.id, label: c.rit || c.titulo }))}
        responsables={responsables.map((u) => ({ id: u.id, label: u.name }))}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link className="btn btn-ghost" href={`/plazos?mes=${monthParam(prev)}`}>
          Mes anterior
        </Link>
        <h2 className="text-lg font-semibold">
          Calendario {start.toLocaleDateString("es-CL", { month: "long", year: "numeric" })}
        </h2>
        <Link className="btn btn-ghost" href={`/plazos?mes=${monthParam(next)}`}>
          Mes siguiente
        </Link>
      </div>

      <div className="space-y-3">
        {plazos.length === 0 && (
          <div className="panel rounded-3xl px-6 py-10 text-center text-sm text-[var(--ink-soft)]/70">
            No hay plazos en este mes. Cree uno arriba o revise el{" "}
            <Link href="/calendario" className="text-[var(--sea)]">
              calendario
            </Link>
            .
          </div>
        )}
        {plazos.map((p) => (
          <div
            key={p.id}
            className="panel flex flex-wrap items-center justify-between gap-4 rounded-3xl px-5 py-4"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold">{p.titulo}</h2>
                <StatusBadge estado={p.estado} />
                <span className="badge badge-ink">{p.tipo}</span>
                {p.esFatal && <span className="badge badge-vencido">fatal</span>}
              </div>
              <p className="mt-1 text-sm text-[var(--ink-soft)]/70">
                {formatDate(p.fechaLimite)} ·{" "}
                {p.causa ? (
                  <Link href={`/causas/${p.causa.id}`} className="text-[var(--sea)]">
                    {p.causa.rit || p.causa.titulo}
                  </Link>
                ) : (
                  "Sin causa"
                )}{" "}
                · {p.responsable?.name || "Sin responsable"}
              </p>
              {p.descripcion && (
                <p className="mt-2 text-sm text-[var(--ink-soft)]/80">{p.descripcion}</p>
              )}
            </div>
            <PlazoGoogleButton plazoId={p.id} />
          </div>
        ))}
      </div>
    </div>
  );
}
