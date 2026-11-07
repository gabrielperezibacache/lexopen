import Link from "next/link";
import { ArrowUpRight, Cloud, Files, GitFork } from "lucide-react";
import { EasyConnectorAdministration } from "@/components/altazor/EasyConnectorOAuth";
import styles from "./WorkspaceArea.module.css";

export function ConnectedAccountsPanel({ locale, canManage = false }: { locale: "es" | "en"; canManage?: boolean }) {
  const tr = (es: string, en: string) => locale === "en" ? en : es;
  const accounts = [
    {
      name: "Google Drive",
      href: "/sincronizacion#sync-google",
      icon: Files,
      description: tr("Elige las carpetas que quieres vincular a tus causas.", "Choose the folders to link to your cases."),
    },
    {
      name: "Google Workspace",
      href: "/inicio?altazor=connectors&connector=google",
      icon: Cloud,
      description: tr("Permite que Altazor consulte nombres y datos básicos de Drive.", "Let Altazor look up names and basic file information in Drive."),
    },
    {
      name: "GitHub",
      href: "/inicio?altazor=connectors&connector=github",
      icon: GitFork,
      description: tr("Autoriza tu cuenta para usar GitHub desde Altazor.", "Authorize your account to use GitHub from Altazor."),
    },
  ];

  return (
    <section id="cuentas-conectadas" className={`panel ${styles.personalIndex}`} aria-labelledby="connected-accounts-title">
      <header className={styles.personalHeading}>
        <div>
          <h3 id="connected-accounts-title">{tr("Cuentas conectadas", "Connected accounts")}</h3>
          <p>{tr("Elige un servicio para iniciar sesión en su página oficial.", "Choose a service to sign in on its official website.")}</p>
        </div>
      </header>
      <ul className={styles.personalLinks}>
        {accounts.map(({ name, href, icon: Icon, description }) => (
          <li key={href}>
            <Link href={href} className={styles.personalLink}>
              <Icon size={19} aria-hidden="true" />
              <span><strong>{name}</strong><small>{description}</small></span>
              <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
      <Link className="btn btn-ghost mt-3" href="/inicio?altazor=connectors">
        {tr("Todas las conexiones y secretos", "All connections and secrets")}
      </Link>
      {canManage && <EasyConnectorAdministration />}
    </section>
  );
}
