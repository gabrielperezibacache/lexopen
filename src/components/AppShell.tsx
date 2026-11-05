"use client";

import Link from "next/link";
import { Bell, Menu, Search, Command } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { UpdateAvailableBanner } from "@/components/UpdateAvailableBanner";
import { useI18n } from "@/components/i18n/I18nProvider";
import { Breadcrumbs } from "@/components/shell/Breadcrumbs";
import { GlobalSearch } from "@/components/shell/GlobalSearch";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { CommandPalette, type CommandItem } from "@/components/ui/CommandPalette";
import { Sheet } from "@/components/ui/Sheet";
import type { SessionUserSummary } from "@/components/auth/UserSwitcher";
import { activeNavigationArea, activeNavigationEntry, navigationEntries, type NavigationModel } from "@/lib/navigation/catalog";
import "@/components/shell/shell.css";

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

function getSidebarCollapsed(key: string) {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function AppShell({
  navigation,
  user,
  unreadCount = 0,
  mailPendingCount = 0,
  showUpdateBanner = false,
  canSelfUpdate = false,
  children,
}: {
  navigation: NavigationModel;
  user?: SessionUserSummary;
  unreadCount?: number;
  mailPendingCount?: number;
  showUpdateBanner?: boolean;
  canSelfUpdate?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const shellRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const mobileOpen = menuPath === pathname;
  const { t } = useI18n();
  const sidebarKey = `${SIDEBAR_KEY}:${user?.id || navigation.mode}`;
  const collapsed = useSyncExternalStore(
    subscribeSidebar,
    () => getSidebarCollapsed(sidebarKey),
    () => false
  );
  const [notifOpen, setNotifOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const currentArea = activeNavigationArea(navigation, pathname || "/");
  const currentEntry = activeNavigationEntry(navigation, pathname || "/");

  function setMobileOpen(open: boolean) {
    setMenuPath(open ? pathname : null);
  }

  function onCollapsedChange(next: boolean) {
    try {
      localStorage.setItem(sidebarKey, next ? "1" : "0");
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(SIDEBAR_EVENT));
  }

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const measure = () => shellRef.current?.style.setProperty("--shell-header-offset", `${header.getBoundingClientRect().height}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

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
    return navigationEntries(navigation).map(entry => ({
      id: entry.id, href: entry.href, label: t(entry.labelKey), keywords: entry.keywords,
      group: entry.area ? t(navigation.areas.find(area => area.id === entry.area)?.labelKey || "nav.groups.portal") : t("nav.globalTools"),
    }));
  }, [navigation, t]);

  return (
    <div ref={shellRef} className="app-shell flex min-h-screen w-full">
      <a href="#main-content" className="skip-link" inert={mobileOpen}>
        {t("common.skipToContent")}
      </a>
      <AppSidebar
        navigation={navigation}
        user={user}
        mailPendingCount={mailPendingCount}
        mobileOpen={mobileOpen}
        onMobileOpenChange={setMobileOpen}
        collapsed={collapsed}
        onCollapsedChange={onCollapsedChange}
      />

      <div className="flex min-h-screen min-w-0 flex-1 flex-col" inert={mobileOpen}>
        <header
          ref={headerRef}
          className="shell-header sticky top-0 z-20 flex items-center gap-2 px-3 py-2.5 md:gap-3 md:px-5"
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
            <Breadcrumbs navigation={navigation} />
            <GlobalSearch />
          </div>

          <div className="min-w-0 flex-1 md:hidden">
            <div className="display truncate text-lg leading-tight">{t(currentEntry?.labelKey || currentArea?.labelKey || (navigation.mode === "portal" ? "nav.portal" : "brand.tagline"))}</div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button type="button" className="shell-quick-nav hidden md:inline-flex" onClick={() => setCommandOpen(true)} aria-label={t("common.commandPalette")}>
              <Command size={15} aria-hidden="true" /><span>{t("common.commandPalette")}</span><kbd>⌘K</kbd>
            </button>
            <Link href="/buscar" className="shell-icon-button md:hidden" aria-label={t("common.searchGlobal")}><Search size={19} aria-hidden="true" /></Link>
            <div className="hidden md:block"><ThemeToggle /></div>
            <button
              type="button"
              className="relative grid min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-xl border border-[var(--line)] bg-[var(--surface-solid)] text-[var(--ink)]"
              aria-label={unreadCount > 0 ? `${t("nav.notifications")}: ${unreadCount}` : t("nav.notifications")}
              onClick={() => setNotifOpen(true)}
            >
              <Bell size={18} aria-hidden="true" />
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
          className="app-content min-w-0 w-full flex-1 px-4 py-6 sm:px-6 md:px-8 md:py-8"
          style={{
            paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
          }}
        >
          {children}
        </main>
      </div>

      <CommandPalette items={commandItems} open={commandOpen} onOpenChange={setCommandOpen} />

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
