"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BookOpen, Bot, FilePenLine, FolderOpen, GraduationCap, Mic } from "lucide-react";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useI18n } from "@/components/i18n/I18nProvider";
import "./welcome.css";

const moduleIcons = [FolderOpen, BookOpen, Mic, FilePenLine, GraduationCap, Bot];

export default function LandingPage() {
  const { dict, t } = useI18n();

  return (
    <div className="lexopen-welcome">
      <header className="edition-header edition-width">
        <Link href="/" className="edition-wordmark">
          <Image src="/icons/lexopen-reader-192.png" width={40} height={40} alt="" />
          <span className="display">LexOpen</span>
        </Link>
        <nav className="edition-nav" aria-label={t("login.access")}>
          <LanguageSwitcher variant="compact" />
          <Link href="/login" className="btn btn-ghost">
            {t("landing.signIn")}
          </Link>
        </nav>
      </header>

      <main className="edition-width">
        <section className="edition-hero" aria-labelledby="edition-title">
          <div className="edition-intro">
            <h1 id="edition-title" className="display">{t("login.storyTitle")}</h1>
            <p>{t("login.storyBody")}</p>
            <div className="edition-actions">
              <Link href="/login" className="btn btn-primary">
                {t("landing.openPlatform")} <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </div>
          <Image
            src="/icons/lexopen-logo.png"
            width={1254}
            height={1254}
            sizes="(max-width: 640px) 272px, (max-width: 880px) 352px, 512px"
            alt=""
            loading="eager"
            fetchPriority="high"
            className="edition-engraving edition-hero-art"
          />
        </section>

        <section className="edition-index" aria-labelledby="edition-index-title">
          <div className="edition-index-copy">
            <h2 id="edition-index-title" className="display">{t("brand.openPlatform")}</h2>
            <p>{t("landing.lead")}</p>
          </div>
          <ul className="edition-modules">
            {dict.landing.modules.map((mod, i) => {
              const Icon = moduleIcons[i] || FolderOpen;
              return (
                <li key={mod.title}>
                  <Icon size={20} aria-hidden="true" />
                  <div>
                    <h3>{mod.title}</h3>
                    <p>{mod.text}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </main>
    </div>
  );
}
