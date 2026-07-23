import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Bot,
  Building2,
  FolderSync,
  Scale,
  Sheet,
  Shield,
} from "lucide-react";

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
              Open source HighQ clone
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/sites" className="btn btn-ghost hidden sm:inline-flex">
            Sites
          </Link>
          <Link href="/dashboard" className="btn btn-primary">
            Entrar al estudio <ArrowRight size={16} />
          </Link>
        </div>
      </header>

      <section className="relative mx-auto grid max-w-6xl gap-10 px-6 pb-20 pt-10 md:grid-cols-[1.15fr_0.85fr] md:items-end md:pt-16">
        <div className="fade-up">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-[var(--sea)]">
            Chile · Legal operations
          </p>
          <h1 className="display text-5xl leading-[1.05] text-[var(--ink)] md:text-6xl lg:text-7xl">
            LexOpen
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-[var(--ink-soft)]/85">
            Clon open-source de HighQ: sites, VDR, iSheets, tasks, wiki, Q&A y workflows —
            más causas judiciales chilenas, jurisprudencia, Obsidian, Hermes y Google Workspace.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/dashboard" className="btn btn-primary">
              Abrir plataforma
            </Link>
            <Link href="/sites" className="btn btn-secondary">
              Explorar sites
            </Link>
          </div>
        </div>

        <div className="fade-up-delay relative min-h-[340px] overflow-hidden rounded-[2rem] border border-[var(--line)] bg-[linear-gradient(160deg,#0c1c24_0%,#1a3d3f_55%,#2a4d3a_100%)] p-6 text-white shadow-[var(--shadow)]">
          <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:28px_28px]" />
          <div className="relative">
            <div className="text-xs uppercase tracking-[0.18em] text-white/50">Matter site</div>
            <div className="display mt-3 text-3xl">Andes · C-4521-2025</div>
            <p className="mt-2 text-sm text-white/70">Files · Tasks · iSheets · Q&A · Wiki</p>
            <div className="mt-8 space-y-3">
              {[
                "VDR con versionado y comentarios",
                "iSheet de hitos procesales",
                "Workflow de aprobación de escritos",
                "Portal cliente + sync Obsidian",
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
        <div className="fade-up-delay-2 grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          {[
            { icon: Building2, title: "Sites", text: "Matters, VDR, knowledge, portal" },
            { icon: Shield, title: "Files", text: "Data room, versiones, metadata" },
            { icon: Sheet, title: "iSheets", text: "Tablas estructuradas colaborativas" },
            { icon: BookOpen, title: "Wiki + Q&A", text: "Conocimiento y preguntas cliente" },
            { icon: FolderSync, title: "Integraciones", text: "Obsidian · Google · Hermes" },
            { icon: Bot, title: "Chile", text: "Causas RIT/RUC + jurisprudencia" },
          ].map(({ icon: Icon, title, text }) => (
            <article key={title} className="panel rounded-3xl p-4">
              <Icon className="text-[var(--copper)]" size={20} />
              <h2 className="mt-3 text-base font-semibold">{title}</h2>
              <p className="mt-1 text-xs leading-relaxed text-[var(--ink-soft)]/80">{text}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
