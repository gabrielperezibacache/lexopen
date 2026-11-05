import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { getI18n } from "@/lib/i18n/server";

/** No PJUD components are mounted while the connected workspace is disabled. */
export async function PjudManagementNotice({ canConfigure }: { canConfigure: boolean }) {
  const { locale } = await getI18n(), tr = (es: string, en: string) => locale === "en" ? en : es;
  return <div className="space-y-6" data-testid="pjud-disabled"><PageHeader title="PJUD · Chile" /><div className="max-w-prose space-y-4"><h2 className="text-xl font-medium">{tr("La conexión judicial está desactivada", "The court connection is disabled")}</h2><p className="text-[var(--ink-soft)]">{canConfigure ? tr("Puede activarla en Configuración. Sus causas y documentos se conservan.", "Enable it in Settings. Your matters and documents are preserved.") : tr("El administrador puede activar esta conexión. Sus causas y documentos se conservan.", "An administrator can enable this connection. Your matters and documents are preserved.")}</p><div className="flex flex-wrap gap-3"><Link className="btn btn-primary" href="/causas">{tr("Abrir mis causas", "Open my matters")}</Link>{canConfigure && <Link className="btn btn-secondary" href="/configuracion#case-management-settings">{tr("Configurar causas", "Matter settings")}</Link>}</div></div></div>;
}
