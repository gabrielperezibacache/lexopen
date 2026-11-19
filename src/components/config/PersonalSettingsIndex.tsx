import Link from "next/link";
import { ArrowUpRight, Bell, Cloud, MessageSquare, ShieldCheck } from "lucide-react";
import { FolioSymbol } from "@/components/ui/FolioSymbol";
import styles from "./WorkspaceArea.module.css";

export function PersonalSettingsIndex({ locale }: { locale: "es" | "en" }) {
  const tr = (es: string, en: string) => locale === "en" ? en : es;
  const items = [
    { href: "/cuenta#seguridad", icon: ShieldCheck, title: tr("Contraseña y verificación", "Password and verification"), detail: tr("Protege el acceso a tu cuenta.", "Protect access to your account.") },
    { href: "/cuenta/notificaciones", icon: Bell, title: tr("Mis notificaciones", "My notifications"), detail: tr("Elige cómo y cuándo recibir avisos.", "Choose how and when to receive notices.") },
    { href: "/sincronizacion", icon: Cloud, title: tr("Drive del estudio", "Firm Drive"), detail: tr("Organización, clientes y causas.", "Organization, clients and matters.") },
    { href: "/cuenta/feedback", icon: MessageSquare, title: "Feedback", detail: tr("Propón una mejora o revisa tus comentarios.", "Suggest an improvement or review your feedback.") },
  ];
  return <section id="cuenta-personal" className={`panel ${styles.personalIndex}`} aria-labelledby="personal-settings-title">
    <div className={styles.personalHeading}>
      <div>
        <h3 id="personal-settings-title">{tr("Tu cuenta", "Your account")}</h3>
      </div>
      <FolioSymbol className={styles.personalEmblem} />
    </div>
    <ul className={styles.personalLinks}>
      {items.map(({ href, icon: Icon, title, detail }) => (
        <li key={href}>
          <Link href={href} className={styles.personalLink}>
            <Icon size={19} aria-hidden="true" />
            <span><strong>{title}</strong><small>{detail}</small></span>
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  </section>;
}
