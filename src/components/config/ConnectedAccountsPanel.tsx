import Link from "next/link";
import { ArrowUpRight, Cloud, Files, FolderOpen, GitFork } from "lucide-react";
import { EasyConnectorAdministration } from "@/components/altazor/EasyConnectorOAuth";
import styles from "./WorkspaceArea.module.css";

export function ConnectedAccountsPanel({ locale, canManage = false }: { locale: "es" | "en"; canManage?: boolean }) {
  const tr = (es: string, en: string) => locale === "en" ? en : es;
  const accounts = [
    {
      name: "Google Drive",
      href: "/inicio?altazor=connectors&connector=google",
      icon: Files,
      description: tr("Busca y lee tus archivos autorizados de Drive, sin modificarlos.", "Find and read your authorized Drive files without changing them."),
    },
    {
      name: "GitHub",
      href: "/inicio?altazor=connectors&connector=github",
      icon: GitFork,
      description: tr("Consulta tu perfil y los archivos de repositorios públicos de GitHub.", "Read your profile and files in public GitHub repositories."),
    },
    {
      name: "Dropbox",
      href: "/inicio?altazor=connectors&connector=dropbox",
      icon: FolderOpen,
      description: tr("Permite que Altazor busque y lea tus archivos autorizados de Dropbox.", "Let Altazor find and read your authorized Dropbox files."),
    },
    {
      name: "OneDrive · Microsoft 365",
      href: "/inicio?altazor=connectors&connector=microsoft",
      icon: Cloud,
      description: tr("Conecta OneDrive para buscar y leer tus archivos, sin modificarlos.", "Connect OneDrive to find and read your files without changing them."),
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
