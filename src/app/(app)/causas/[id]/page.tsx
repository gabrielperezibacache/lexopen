import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { labelEtapa, labelMateria } from "@/lib/chile";
import { StatusBadge, formatDate, formatDateTime } from "@/components/ui";
import { CausaActions } from "@/components/CausaActions";

type Params = { params: Promise<{ id: string }> };

export default async function CausaDetailPage({ params }: Params) {
  const { id } = await params;
  const causa = await prisma.causa.findUnique({
    where: { id },
    include: {
      cliente: true,
      abogado: true,
      partes: true,
      documentos: { orderBy: { updatedAt: "desc" } },
      plazos: { orderBy: { fechaLimite: "asc" } },
      notas: { orderBy: { updatedAt: "desc" } },
      actividades: {
        include: { user: true },
        orderBy: { createdAt: "desc" },
        take: 30,
      },
    },
  });
  if (!causa) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/causas" className="text-sm text-[var(--sea)]">
            ← Causas
          </Link>
          <h1 className="display mt-2 text-4xl">{causa.titulo}</h1>
          <p className="mt-2 text-[var(--ink-soft)]/80">
            {causa.caratula || "Sin carátula"} · {causa.rit || "Sin RIT"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge estado={causa.estado} />
            <span className="badge badge-sea">{labelMateria(causa.materia)}</span>
            <span className="badge badge-ink">{labelEtapa(causa.etapa)}</span>
          </div>
        </div>
        <CausaActions causaId={causa.id} />
      </div>

      <div className="panel flex flex-wrap items-center justify-between gap-3 rounded-3xl px-5 py-4">
        <div>
          <div className="text-sm font-semibold">Facturación de la causa</div>
          <p className="text-sm text-[var(--ink-soft)]/75">
            Horas, gastos, tarifas y documentos tributarios vinculados al cliente.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/facturacion/horas" className="btn btn-ghost">
            Horas
          </Link>
          <Link href="/facturacion/facturas" className="btn btn-secondary">
            Facturas
          </Link>
          <Link
            href={`/facturacion/cuenta-corriente${causa.clienteId ? `?clienteId=${causa.clienteId}` : ""}`}
            className="btn btn-primary"
          >
            Cuenta corriente
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="panel rounded-3xl p-5 md:col-span-2">
          <h2 className="text-lg font-semibold">Ficha procesal</h2>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
            <div>
              <dt className="text-[var(--ink-soft)]/60">Tribunal</dt>
              <dd className="font-medium">{causa.tribunal}</dd>
            </div>
            <div>
              <dt className="text-[var(--ink-soft)]/60">Procedimiento</dt>
              <dd className="font-medium">{causa.procedimiento || "—"}</dd>
            </div>
            <div>
              <dt className="text-[var(--ink-soft)]/60">RUC</dt>
              <dd className="font-medium">{causa.ruc || "—"}</dd>
            </div>
            <div>
              <dt className="text-[var(--ink-soft)]/60">Ingreso</dt>
              <dd className="font-medium">{formatDate(causa.fechaIngreso)}</dd>
            </div>
            <div>
              <dt className="text-[var(--ink-soft)]/60">Cliente</dt>
              <dd className="font-medium">{causa.cliente?.razonSocial || "—"}</dd>
            </div>
            <div>
              <dt className="text-[var(--ink-soft)]/60">Abogado</dt>
              <dd className="font-medium">{causa.abogado?.name || "—"}</dd>
            </div>
          </dl>
          <p className="mt-4 text-sm leading-relaxed text-[var(--ink-soft)]/85">
            {causa.resumen || "Sin resumen."}
          </p>
        </div>

        <div className="panel rounded-3xl p-5">
          <h2 className="text-lg font-semibold">Partes</h2>
          <ul className="mt-4 space-y-3">
            {causa.partes.map((p) => (
              <li key={p.id} className="rounded-2xl border border-[var(--line)] bg-white/70 px-3 py-2 text-sm">
                <div className="font-medium">{p.nombre}</div>
                <div className="text-[var(--ink-soft)]/65">
                  {p.rol}
                  {p.rut ? ` · ${p.rut}` : ""}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel rounded-3xl p-5">
          <h2 className="text-lg font-semibold">Plazos</h2>
          <div className="mt-4 space-y-3">
            {causa.plazos.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--line)] px-3 py-2">
                <div>
                  <div className="text-sm font-medium">{p.titulo}</div>
                  <div className="text-xs text-[var(--ink-soft)]/65">{formatDate(p.fechaLimite)}</div>
                </div>
                <StatusBadge estado={p.estado} />
              </div>
            ))}
            {causa.plazos.length === 0 && (
              <p className="text-sm text-[var(--ink-soft)]/65">Sin plazos.</p>
            )}
          </div>
        </section>

        <section className="panel rounded-3xl p-5">
          <h2 className="text-lg font-semibold">Documentos</h2>
          <div className="mt-4 space-y-3">
            {causa.documentos.map((d) => (
              <div key={d.id} className="rounded-2xl border border-[var(--line)] px-3 py-2 text-sm">
                <div className="font-medium">{d.nombre}</div>
                <div className="text-xs text-[var(--ink-soft)]/65">
                  {d.tipo} · v{d.version}
                  {d.obsidianPath ? ` · Obsidian: ${d.obsidianPath}` : ""}
                </div>
              </div>
            ))}
            {causa.documentos.length === 0 && (
              <p className="text-sm text-[var(--ink-soft)]/65">Sin documentos.</p>
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel rounded-3xl p-5">
          <h2 className="text-lg font-semibold">Notas (Obsidian)</h2>
          <div className="mt-4 space-y-4">
            {causa.notas.map((n) => (
              <article key={n.id} className="rounded-2xl border border-[var(--line)] bg-white/70 p-4">
                <h3 className="font-medium">{n.titulo}</h3>
                <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-[var(--ink-soft)]/85">
                  {n.contenido}
                </pre>
              </article>
            ))}
            {causa.notas.length === 0 && (
              <p className="text-sm text-[var(--ink-soft)]/65">Sin notas.</p>
            )}
          </div>
        </section>

        <section className="panel rounded-3xl p-5">
          <h2 className="text-lg font-semibold">Actividad</h2>
          <div className="mt-4 space-y-3">
            {causa.actividades.map((a) => (
              <div key={a.id} className="border-b border-[var(--line)] pb-3 text-sm last:border-0">
                <div>{a.mensaje}</div>
                <div className="mt-1 text-xs text-[var(--ink-soft)]/60">
                  {a.user?.name || "Sistema"} · {formatDateTime(a.createdAt)} · {a.tipo}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
