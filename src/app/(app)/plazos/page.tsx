import { prisma } from "@/lib/db";
import { StatusBadge, formatDate } from "@/components/ui";
import Link from "next/link";
import { PlazoGoogleButton } from "@/components/PlazoGoogleButton";
import { PlazoForm } from "@/components/PlazoForm";
import { publicUserSelect } from "@/lib/auth/public-user";
import { requireStaff } from "@/lib/auth/session";
import { PageHeader } from "@/components/sites/SiteNav";

type Props = {
  searchParams: Promise<{
    mes?: string;
    causaId?: string;
    fechaLimite?: string;
    desde?: string;
    dias?: string;
    computo?: string;
    titulo?: string;
  }>;
};

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
      <PageHeader
        eyebrow="Gestión de términos"
        title="Plazos"
        subtitle="Plazos procesales, audiencias e internos. Envíelos a Google Calendar con un clic."
        actions={
          <Link className="btn btn-secondary" href="/agente?utility=plazos">
            Analizar con copiloto
          </Link>
        }
      />

      <PlazoForm
        causas={causas.map((c) => ({ id: c.id, label: c.rit || c.titulo }))}
        responsables={responsables.map((u) => ({ id: u.id, label: u.name }))}
        defaults={{
          causaId: sp.causaId || "",
          fechaNotificacion: sp.desde || "",
          diasPlazo: sp.dias || "",
          tipoComputo: sp.computo === "corridos" ? "corridos" : "habiles",
          fechaLimite: sp.fechaLimite || "",
          titulo: sp.titulo || "",
        }}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <Link
          className="btn btn-ghost order-2 flex-1 sm:order-1 sm:flex-none"
          href={`/plazos?mes=${monthParam(prev)}`}
          aria-label="Mes anterior"
        >
          ← <span className="sm:hidden">Ant.</span>
          <span className="hidden sm:inline">Mes anterior</span>
        </Link>
        <h2 className="order-1 text-center text-lg font-semibold capitalize sm:order-2">
          Calendario {start.toLocaleDateString("es-CL", { month: "long", year: "numeric" })}
        </h2>
        <Link
          className="btn btn-ghost order-3 flex-1 sm:flex-none"
          href={`/plazos?mes=${monthParam(next)}`}
          aria-label="Mes siguiente"
        >
          <span className="sm:hidden">Sig.</span>
          <span className="hidden sm:inline">Mes siguiente</span> →
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
