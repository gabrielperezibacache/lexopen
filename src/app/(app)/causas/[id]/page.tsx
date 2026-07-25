import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { labelEtapa, labelMateria } from "@/lib/chile";
import { StatusBadge, formatDate, formatDateTime } from "@/components/ui";
import { CausaActions } from "@/components/CausaActions";
import { DriveFolderPanel } from "@/components/DriveFolderPanel";
import { labelTipoMinuta } from "@/lib/minutas";

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
      minutas: {
        include: {
          autor: { select: { name: true } },
          acciones: { where: { estado: { not: "hecha" } } },
        },
        orderBy: { fecha: "desc" },
        take: 12,
      },
      actividades: {
        include: { user: true },
        orderBy: { createdAt: "desc" },
        take: 30,
      },
    },
  });
  if (!causa) notFound();

  const ultimaMinuta = causa.minutas[0];
  const accionesAbiertas = causa.minutas.reduce(
    (n, m) => n + m.acciones.length,
    0
  );

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
            {causa.googleDriveFolderId && (
              <span className="badge badge-activa">Drive vinculado</span>
            )}
          </div>
        </div>
        <CausaActions causaId={causa.id} />
      </div>

      <div className="panel rounded-3xl border border-[var(--sea)]/20 bg-[linear-gradient(135deg,rgba(31,111,120,0.08),rgba(255,255,255,0.85))] px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl">
            <div className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--sea)]">
              Continuidad del expediente
            </div>
            <h2 className="mt-2 text-xl font-semibold">
              ¿Acaba de salir de una audiencia, reunión o llamada?
            </h2>
            <p className="mt-2 text-sm text-[var(--ink-soft)]/80">
              Genere la minuta con el resumen, acuerdos y próximos pasos para
              que cualquier abogado del estudio pueda continuar la tramitación.
            </p>
            {ultimaMinuta && (
              <p className="mt-3 text-sm text-[var(--ink-soft)]/70">
                Última:{" "}
                <Link
                  href={`/causas/${causa.id}/minutas/${ultimaMinuta.id}`}
                  className="text-[var(--sea)] underline-offset-2 hover:underline"
                >
                  {labelTipoMinuta(ultimaMinuta.tipo)} — {ultimaMinuta.titulo}
                </Link>{" "}
                · {accionesAbiertas} acción(es) abierta(s)
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/causas/${causa.id}/minuta/nueva?tipo=audiencia`}
              className="btn btn-primary"
            >
              Minuta audiencia
            </Link>
            <Link
              href={`/causas/${causa.id}/minuta/nueva?tipo=reunion`}
              className="btn btn-secondary"
            >
              Minuta reunión
            </Link>
            <Link
              href={`/causas/${causa.id}/minuta/nueva?tipo=llamada`}
              className="btn btn-ghost"
            >
              Minuta llamada
            </Link>
          </div>
        </div>
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

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="panel rounded-3xl p-5 lg:col-span-2">
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

        <DriveFolderPanel
          causaId={causa.id}
          folderId={causa.googleDriveFolderId}
          folderName={causa.googleDriveFolderName}
          folderUrl={causa.googleDriveFolderUrl}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="panel rounded-3xl p-5 md:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Minutas del expediente</h2>
            <Link href="/minutas" className="text-sm text-[var(--sea)]">
              Ver todas
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {causa.minutas.map((m) => (
              <Link
                key={m.id}
                href={`/causas/${causa.id}/minutas/${m.id}`}
                className="block rounded-2xl border border-[var(--line)] bg-white/70 px-4 py-3 transition hover:border-[var(--sea)]/40"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="badge badge-sea">
                    {labelTipoMinuta(m.tipo)}
                  </span>
                  <span className="text-sm font-medium">{m.titulo}</span>
                </div>
                <div className="mt-1 text-xs text-[var(--ink-soft)]/65">
                  {formatDateTime(m.fecha)} · {m.autor?.name || "Sin autor"} ·{" "}
                  {m.acciones.length} pendientes
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-[var(--ink-soft)]/80">
                  {m.resumenEjecutivo}
                </p>
              </Link>
            ))}
            {causa.minutas.length === 0 && (
              <p className="text-sm text-[var(--ink-soft)]/65">
                Aún no hay minutas. Registre la primera tras el próximo acto.
              </p>
            )}
          </div>
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
                  {d.googleDriveId ? ` · Drive: ${d.googleDriveId}` : ""}
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
