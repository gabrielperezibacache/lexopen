"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n/I18nProvider";
import { navigationBreadcrumbs, type NavigationModel } from "@/lib/navigation/catalog";

export function Breadcrumbs({ navigation }: { navigation: NavigationModel }) {
  const pathname = usePathname() || "/";
  const { t } = useI18n();
  const crumbs = navigationBreadcrumbs(navigation, pathname);
  if (!crumbs.length) return null;
  return <nav aria-label={t("common.breadcrumbs")} className="min-w-0">
    <ol className="flex flex-wrap items-center gap-1 text-xs text-[var(--muted)]">
      {crumbs.map((crumb, index) => <li key={crumb.href} className="flex min-w-0 items-center gap-1">
        {index > 0 && <span aria-hidden="true">/</span>}
        {index === crumbs.length - 1
          ? <span className="truncate font-medium text-[var(--ink)]" aria-current="page">{t(crumb.labelKey)}</span>
          : <Link href={crumb.href} className="truncate hover:text-[var(--sea)]">{t(crumb.labelKey)}</Link>}
      </li>)}
    </ol>
  </nav>;
}
