"use client";

import Link from "next/link";
import { Bell, Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { UpdateAvailableBanner } from "@/components/UpdateAvailableBanner";
import { useI18n } from "@/components/i18n/I18nProvider";
import { Breadcrumbs } from "@/components/shell/Breadcrumbs";
import { GlobalSearch } from "@/components/shell/GlobalSearch";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { CommandPalette, type CommandItem } from "@/components/ui/CommandPalette";
import { Sheet } from "@/components/ui/Sheet";

const SIDEBAR_KEY = "lexopen_sidebar_collapsed";
const SIDEBAR_EVENT = "lexopen-sidebar";

function subscribeSidebar(onStoreChange: () => void) {
  const handler = () => onStoreChange();
  window.addEventListener("storage", handler);
  window.addEventListener(SIDEBAR_EVENT, handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(SIDEBAR_EVENT, handler);
  };
}

function getSidebarCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === "1";
  } catch {
    return false;
  }
}

export function AppShell({
  role,
  unreadCount = 0,
  mailPendingCount = 0,
  showUpdateBanner = false,
  canSelfUpdate = false,
  children,
}: {
  role?: string | null;
  unreadCount?: number;
  mailPendingCount?: number;
  showUpdateBanner?: boolean;
  canSelfUpdate?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const mobileOpen = menuPath === pathname;
  const { t } = useI18n();
  const collapsed = useSyncExternalStore(
    subscribeSidebar,
    getSidebarCollapsed,
    () => false
  );
  const [notifOpen, setNotifOpen] = useState(false);

  function setMobileOpen(open: boolean) {
    setMenuPath(open ? pathname : null);
  }

  function onCollapsedChange(next: boolean) {
    try {
      localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(SIDEBAR_EVENT));
  }

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const onChange = () => {
      if (desktop.matches) setMenuPath(null);
    };
    desktop.addEventListener("change", onChange);
    return () => desktop.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuPath(null);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [mobileOpen]);

  const commandItems = useMemo<CommandItem[]>(() => {
    const groups: Array<[string, string, string]> = [
      ["/inicio", t("nav.home"), t("nav.groups.work")],
      ["/causas", t("nav.cases"), t("nav.groups.work")],
      ["/plazos", t("nav.deadlines"), t("nav.groups.work")],
      ["/calendario", t("nav.calendar"), t("nav.groups.work")],
      ["/tareas", t("nav.tasks"), t("nav.groups.work")],
      ["/clientes", t("nav.clients"), t("nav.groups.clients")],
      ["/portal", t("nav.portal"), t("nav.groups.clients")],
      ["/documentos", t("nav.documents"), t("nav.groups.documents")],
      ["/minutas", t("nav.minutes"), t("nav.groups.documents")],
      ["/jurisprudencia", t("nav.jurisprudence"), t("nav.groups.documents")],
      ["/facturacion", t("nav.billing"), t("nav.groups.admin")],
      ["/configuracion", t("nav.settings"), t("nav.groups.admin")],
      ["/integraciones", t("nav.integrations"), t("nav.groups.admin")],
      ["/auditoria", t("nav.audit"), t("nav.groups.admin")],
      ["/buscar", t("nav.search"), t("nav.groups.documents")],
      ["/notificaciones", t("nav.notifications"), t("nav.groups.admin")],
    ];
    return groups.map(([href, label, group]) => ({
      id: href,
      href,
      label,
      group,
    }));
  }, [t]);

  return (
    <div className="flex min-h-screen w-full">
      <a href="#main-content" className="skip-link" inert={mobileOpen}>
        {t("common.skipToContent")}
      </a>
      <AppSidebar
        role={role}
        unreadCount={unreadCount}
        mailPendingCount={mailPendingCount}
        mobileOpen={mobileOpen}
        onMobileOpenChange={setMobileOpen}
        collapsed={collapsed}
        onCollapsedChange={onCollapsedChange}
      />

      <div className="flex min-h-screen min-w-0 flex-1 flex-col" inert={mobileOpen}>
        <header
          className="shell-header sticky top-0 z-20 flex items-center gap-3 px-3 py-2.5 md:px-5"
          style={{ paddingTop: "max(0.625rem, env(safe-area-inset-top))" }}
        >
          <button
            type="button"
            className="grid min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-xl border border-[var(--line)] bg-[var(--surface-solid)] text-[var(--ink)] md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label={t("common.openMenu")}
            aria-expanded={mobileOpen}
            aria-controls="lexopen-mobile-nav"
          >
            <Menu size={20} />
          </button>

          <div className="hidden min-w-0 flex-1 flex-col gap-1 md:flex">
            <Breadcrumbs />
            <GlobalSearch />
          </div>

          <div className="min-w-0 flex-1 md:hidden">
            <div className="display truncate text-lg leading-none">LexOpen</div>
            <div className="mt-0.5 truncate text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
              {t("brand.tagline")}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden md:block">
              <ThemeToggle />
            </div>
            <button
              type="button"
              className="relative grid min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-xl border border-[var(--line)] bg-[var(--surface-solid)] text-[var(--ink)]"
              aria-label={t("nav.notifications")}
              onClick={() => setNotifOpen(true)}
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 min-w-[1.15rem] rounded-full bg-[var(--copper)] px-1 py-0.5 text-center text-[10px] font-semibold leading-none text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
          </div>
        </header>

        <UpdateAvailableBanner
          enabled={showUpdateBanner}
          canSelfUpdate={canSelfUpdate}
        />

        <main
          id="main-content"
          tabIndex={-1}
          className="min-w-0 w-full flex-1 px-3 py-4 sm:px-5 sm:py-5 md:px-8 md:py-7"
          style={{
            paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
          }}
        >
          {children}
        </main>
      </div>

      <CommandPalette items={commandItems} />

      <Sheet
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        title={t("nav.notifications")}
        side="right"
      >
        <p className="text-sm text-[var(--muted)]">
          {unreadCount > 0
            ? String(unreadCount)
            : t("common.noNotifications")}
        </p>
        <Link
          href="/notificaciones"
          className="btn btn-primary mt-4 w-full"
          onClick={() => setNotifOpen(false)}
        >
          {t("common.viewAll")}
        </Link>
      </Sheet>
    </div>
  );
}
