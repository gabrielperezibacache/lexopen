import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDate, StatusBadge } from "@/components/ui";
import { labelMateria } from "@/lib/chile";
import { ArrowRight, Briefcase, CalendarClock, Files, BookOpen } from "lucide-react";

async function ensureSeeded() {
  const count = await prisma.causa.count();
  if (count === 0) {
    const { execFile } = await import("child_process");
    const { promisify } = await import("util");
    const execFileAsync = promisify(execFile);
    await execFileAsync("npx", ["tsx", "prisma/seed.ts"], {
      cwd: process.cwd(),
      env: process.env,
    });
  }
}

export default async function DashboardPage() {
  await ensureSeeded();

  const [causas, plazosPendientes, documentos, jurisprudencia, proximosPlazos, causasRecientes, actividades] =
    await Promise.all([
      prisma.causa.count({ where: { estado: "activa" } }),
      prisma.plazo.count({ where: { estado: "pendiente" } }),
      prisma.documento.count(),
      prisma.jurisprudencia.count(),
      prisma.plazo.findMany({
        where: { estado: { in: ["pendiente", "vencido"] } },
        include: { causa: true, responsable: true },
        orderBy: { fechaLimite: "asc" },
        take: 6,
      }),
      prisma.causa.findMany({
        include: { cliente: true, abogado: true },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
      prisma.activity.findMany({
        include: { user: true, causa: true },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
    ]);

  const stats = [
    { label: "Causas activas", value: causas, icon: Briefcase },
    { label: "Plazos pendientes", value: plazosPendientes, icon: CalendarClock },
    { label: "Documentos", value: documentos, icon: Files },
    { label: "Jurisprudencia", value: jurisprudencia, icon: BookOpen },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--sea)]">
            Operaciones del estudio
          </p>
          <h1 className="display mt-2 text-4xl">Dashboard</h1>
          <p className="mt-2 max-w-2xl text-[var(--ink-soft)]/80">
            Visibilidad de causas, plazos fatales y actividad colaborativa — al estilo HighQ, open source.
          </p>
        </div>
        <Link href="/causas/nueva" className="btn btn-primary">
          Nueva causa <ArrowRight size={16} />
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <div key={label} className="panel rounded-3xl p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--ink-soft)]/70">{label}</span>
              <Icon size={18} className="text-[var(--copper)]" />
            </div>
            <div className="display mt-3 text-4xl">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel rounded-3xl p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Próximos plazos</h2>
            <Link href="/plazos" className="text-sm text-[var(--sea)]">
              Ver todos
            </Link>
          </div>
          <div className="space-y-3">
            {proximosPlazos.map((p) => (
              <div
                key={p.id}
                className="flex items-start justify-between gap-3 rounded-2xl border border-[var(--line)] bg-white/60 px-4 py-3"
              >
                <div>
                  <div className="font-medium">{p.titulo}</div>
                  <div className="mt-1 text-sm text-[var(--ink-soft)]/70">
                    {p.causa?.rit || p.causa?.titulo || "Sin causa"} · {formatDate(p.fechaLimite)}
                  </div>
                </div>
                <StatusBadge estado={p.estado} />
              </div>
            ))}
          </div>
        </section>

        <section className="panel rounded-3xl p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Causas recientes</h2>
            <Link href="/causas" className="text-sm text-[var(--sea)]">
              Ver todas
            </Link>
          </div>
          <div className="space-y-3">
            {causasRecientes.map((c) => (
              <Link
                key={c.id}
                href={`/causas/${c.id}`}
                className="block rounded-2xl border border-[var(--line)] bg-white/60 px-4 py-3 transition hover:border-[var(--sea)]/40"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium">{c.titulo}</div>
                  <StatusBadge estado={c.estado} />
                </div>
                <div className="mt-1 text-sm text-[var(--ink-soft)]/70">
                  {c.rit || "Sin RIT"} · {labelMateria(c.materia)} · {c.tribunal}
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <section className="panel rounded-3xl p-5">
        <h2 className="mb-4 text-lg font-semibold">Actividad del equipo</h2>
        <div className="space-y-3">
          {actividades.map((a) => (
            <div key={a.id} className="flex gap-3 border-b border-[var(--line)] pb-3 last:border-0">
              <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--copper)]" />
              <div>
                <div className="text-sm">{a.mensaje}</div>
                <div className="mt-1 text-xs text-[var(--ink-soft)]/60">
                  {a.user?.name || "Sistema"} · {a.causa?.rit || a.causa?.titulo || "General"} ·{" "}
                  {formatDate(a.createdAt)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
