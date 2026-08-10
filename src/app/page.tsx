"use client";

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
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useI18n } from "@/components/i18n/I18nProvider";

const moduleIcons = [Building2, Shield, Sheet, BookOpen, FolderSync, Bot];

export default function LandingPage() {
  const { dict, t } = useI18n();

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
              {t("brand.openPlatform")}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <LanguageSwitcher variant="compact" />
          <Link href="/login" className="btn btn-ghost">
            {t("landing.signIn")}
          </Link>
          <Link href="/login" className="btn btn-primary">
            {t("landing.enterFirm")} <ArrowRight size={16} />
          </Link>
        </div>
      </header>

      <section className="relative mx-auto grid max-w-6xl gap-10 px-6 pb-20 pt-10 md:grid-cols-[1.15fr_0.85fr] md:items-end md:pt-16">
        <div className="fade-up">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-[var(--sea)]">
            {t("landing.eyebrow")}
          </p>
          <h1 className="display text-5xl leading-[1.05] text-[var(--ink)] md:text-6xl lg:text-7xl">
            LexOpen
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-[var(--ink-soft)]/85">
            {t("landing.lead")}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/login" className="btn btn-primary">
              {t("landing.openPlatform")}
            </Link>
            <Link href="/login?next=/dashboard" className="btn btn-secondary">
              {t("landing.seeDemo")}
            </Link>
          </div>
        </div>

        <div className="fade-up-delay relative min-h-[340px] overflow-hidden rounded-[2rem] border border-[var(--line)] bg-[linear-gradient(160deg,#0c1c24_0%,#1a3d3f_55%,#2a4d3a_100%)] p-6 text-white shadow-[var(--shadow)]">
          <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:28px_28px]" />
          <div className="relative">
            <div className="text-xs uppercase tracking-[0.18em] text-white/50">
              {t("landing.matterLabel")}
            </div>
            <div className="display mt-3 text-3xl">Andes · C-4521-2025</div>
            <p className="mt-2 text-sm text-white/70">{t("landing.matterMeta")}</p>
            <div className="mt-8 space-y-3">
              {dict.landing.bullets.map((item) => (
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
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-[var(--sea)]">
          {t("landing.modulesTitle")}
        </p>
        <div className="fade-up-delay-2 grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          {dict.landing.modules.map((mod, i) => {
            const Icon = moduleIcons[i] || Building2;
            return (
              <article key={mod.title} className="panel rounded-3xl p-4">
                <Icon className="text-[var(--copper)]" size={20} />
                <h2 className="mt-3 text-base font-semibold">{mod.title}</h2>
                <p className="mt-1 text-xs leading-relaxed text-[var(--ink-soft)]/80">
                  {mod.text}
                </p>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
