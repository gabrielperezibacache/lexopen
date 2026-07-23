import Link from "next/link";
import { ArrowRight, BookOpen, Bot, FolderSync, Scale, Shield } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="relative overflow-hidden">
      <div className="hero-glow pointer-events-none absolute -right-24 top-0 h-[480px] w-[480px] rounded-full bg-[radial-gradient(circle,rgba(196,122,58,0.28),transparent_70%)]" />
      <div className="pointer-events-none absolute -left-20 top-40 h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle,rgba(31,111,120,0.22),transparent_70%)]" />

      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-[linear-gradient(135deg,#c47a3a,#9a5a28)] text-white shadow-[0_12px_28px_rgba(196,122,58,0.35)]">
            <Scale size={20} />
          </span>
          <div>
            <div className="display text-2xl leading-none">LexOpen</div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--ink-soft)]/70">
              Open source legal ops
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/jurisprudencia" className="btn btn-ghost hidden sm:inline-flex">
            Jurisprudencia
          </Link>
          <Link href="/dashboard" className="btn btn-primary">
            Entrar al estudio <ArrowRight size={16} />
          </Link>
        </div>
      </header>

      <section className="relative mx-auto grid max-w-6xl gap-10 px-6 pb-20 pt-10 md:grid-cols-[1.15fr_0.85fr] md:items-end md:pt-16">
        <div className="fade-up">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-[var(--sea)]">
            Chile · Estudios jurídicos
          </p>
          <h1 className="display text-5xl leading-[1.05] text-[var(--ink)] md:text-6xl lg:text-7xl">
            LexOpen
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-[var(--ink-soft)]/85">
            Colaboración segura, causas judiciales, plazos y jurisprudencia — un
            HighQ open source pensado para el litigio chileno, con Obsidian,
            Hermes Agent y Google Workspace.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/dashboard" className="btn btn-primary">
              Abrir plataforma
            </Link>
            <Link href="/integraciones" className="btn btn-secondary">
              Ver integraciones
            </Link>
          </div>
        </div>

        <div className="fade-up-delay relative min-h-[320px] overflow-hidden rounded-[2rem] border border-[var(--line)] bg-[linear-gradient(160deg,#0c1c24_0%,#1a3d3f_55%,#2a4d3a_100%)] p-6 text-white shadow-[var(--shadow)]">
          <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:28px_28px]" />
          <div className="relative">
            <div className="text-xs uppercase tracking-[0.18em] text-white/50">
              Sala de causas
            </div>
            <div className="display mt-3 text-3xl">C-4521-2025</div>
            <p className="mt-2 text-sm text-white/70">
              1º Juzgado Civil de Santiago · Cobro de pesos
            </p>
            <div className="mt-8 space-y-3">
              {[
                "Audiencia de prueba en 7 días",
                "Sync Obsidian: Notas + escritos",
                "Hermes: borrador con aprobación",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="fade-up-delay-2 grid gap-4 md:grid-cols-4">
          {[
            {
              icon: Shield,
              title: "Colaboración tipo HighQ",
              text: "Espacios de causa, portal cliente, actividad y documentos versionados.",
            },
            {
              icon: BookOpen,
              title: "Jurisprudencia Chile",
              text: "Consulta por rol, tribunal, materia y doctrina con corpus de demostración.",
            },
            {
              icon: FolderSync,
              title: "Obsidian + Google",
              text: "Exporta vault Markdown y conecta Drive, Calendar y Gmail vía OAuth.",
            },
            {
              icon: Bot,
              title: "Hermes Agent",
              text: "API OpenAI-compatible con guardrails de aprobación humana.",
            },
          ].map(({ icon: Icon, title, text }) => (
            <article key={title} className="panel rounded-3xl p-5">
              <Icon className="text-[var(--copper)]" size={22} />
              <h2 className="mt-4 text-lg font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]/80">
                {text}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
