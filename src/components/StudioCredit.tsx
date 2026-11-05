"use client";

import Image from "next/image";
import { useI18n } from "@/components/i18n/I18nProvider";
import styles from "./StudioCredit.module.css";

export function StudioCredit({ className = "" }: { className?: string }) {
  const { t } = useI18n();

  return (
    <footer className={`${styles.footer} ${className}`}>
      <a className={styles.link} href="https://perezibacache.cl/" target="_blank" rel="noreferrer">
        <Image className={styles.logo} src="/icons/perez-ibacache-symbol.png" width={32} height={32} alt="" unoptimized />
        <span>{t("brand.developedBy")}</span>
      </a>
    </footer>
  );
}
