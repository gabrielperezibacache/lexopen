import Link from "next/link";
import { prisma } from "@/lib/db";
import { clasificarUrgencia } from "@/lib/plazos";
import { formatDate } from "@/components/ui";
import { requireStaffPage } from "@/lib/auth/access";

function monthMatrix(base: Date) {
  const year = base.getFullYear();
  const month = base.getMonth();
  const first = new Date(year, month, 1);
  const startPad = (first.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<{ date: Date | null }> = [];
  for (let i = 0; i < startPad; i++) cells.push({ date: null });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d, 12) });
  }
  while (cells.length % 7 !== 0) cells.push({ date: null });
  return cells;
}

export default async function CalendarioPage() {
  await requireStaffPage();
  const now = new Date();
  const [plazos, tasks] = await Promise.all([
    prisma.plazo.findMany({
      where: { estado: { in: ["pendiente", "vencido"] } },
      include: { causa: true },
      orderBy: { fechaLimite: "asc" },
    }),
    prisma.task.findMany({
      where: { status: { not: "done" }, dueDate: { not: null } },
      include: { site: true },
      orderBy: { dueDate: "asc" },
      take: 40,
    }),
  ]);

  const cells = monthMatrix(now);
  const monthLabel = now.toLocaleDateString("es-CL", {
    month: "long",
    year: "numeric",
  });

  function eventsOn(day: Date) {
    const key = day.toISOString().slice(0, 10);
    const p = plazos.filter(
      (x) => x.fechaLimite.toISOString().slice(0, 10) === key
    );
    const t = tasks.filter(
      (x) => x.dueDate && x.dueDate.toISOString().slice(0, 10) === key
    );
    return { p, t };
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--sea)]">
          Agenda del estudio
        </p>
        <h1 className="display mt-2 text-4xl">Calendario</h1>
        <p className="mt-2 text-[var(--ink-soft)]/80">
          Plazos procesales (hábiles/fatales) y vencimientos de tareas — {monthLabel}.
        </p>
      </div>

      <section className="panel rounded-3xl p-4">
        <div className="mb-3 grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase tracking-wider text-[var(--ink-soft)]/55">
          {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {cells.map((c, i) => {
            if (!c.date) {
              return <div key={`e-${i}`} className="min-h-24 rounded-xl bg-white/30" />;
            }
            const { p, t } = eventsOn(c.date);
            const isToday =
              c.date.toDateString() === now.toDateString();
            return (
              <div
                key={c.date.toISOString()}
                className={`min-h-24 rounded-xl border px-2 py-2 ${
                  isToday
                    ? "border-[var(--sea)] bg-[var(--sea)]/8"
                    : "border-[var(--line)] bg-white/60"
                }`}
              >
                <div className="text-xs font-semibold">{c.date.getDate()}</div>
                <div className="mt-1 space-y-1">
                  {p.slice(0, 2).map((x) => (
                    <Link
                      key={x.id}
                      href={x.causaId ? `/causas/${x.causaId}` : "/plazos"}
                      className={`block truncate rounded px-1 text-[10px] ${
                        x.esFatal || clasificarUrgencia(x.fechaLimite) === "critico"
                          ? "bg-red-100 text-red-800"
                          : "bg-[var(--copper)]/15 text-[var(--ink)]"
                      }`}
                      title={x.titulo}
                    >
                      {x.esFatal ? "⚡ " : ""}
                      {x.titulo}
                    </Link>
                  ))}
                  {t.slice(0, 1).map((x) => (
                    <div
                      key={x.id}
                      className="truncate rounded bg-[var(--sea)]/10 px-1 text-[10px]"
                      title={x.title}
                    >
                      {x.title}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel rounded-3xl p-5">
        <h2 className="text-lg font-semibold">Próximos plazos</h2>
        <div className="mt-4 space-y-2">
          {plazos.slice(0, 12).map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--line)] px-3 py-2 text-sm"
            >
              <div>
                <div className="font-medium">
                  {p.esFatal ? "⚡ " : ""}
                  {p.titulo}
                </div>
                <div className="text-xs text-[var(--ink-soft)]/65">
                  {p.causa?.rit || "Sin causa"} · {p.tipoComputo} ·{" "}
                  {formatDate(p.fechaLimite)}
                </div>
              </div>
              <span className="badge badge-pendiente">
                {clasificarUrgencia(p.fechaLimite)}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
