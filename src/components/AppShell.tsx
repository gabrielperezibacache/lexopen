"use client";

import Link from "next/link";
import { Bell, Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { UpdateAvailableBanner } from "@/components/UpdateAvailableBanner";
import { useI18n } from "@/components/i18n/I18nProvider";

export function AppShell({
  role,
  unreadCount = 0,
  showUpdateBanner = false,
  canSelfUpdate = false,
  children,
}: {
  role?: string | null;
  unreadCount?: number;
  showUpdateBanner?: boolean;
  canSelfUpdate?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // Open only while still on the route where the menu was opened — closes on
  // navigation without setState inside an effect (eslint react-hooks/set-state-in-effect).
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const mobileOpen = menuPath === pathname;
  const { t } = useI18n();

  function setMobileOpen(open: boolean) {
    setMenuPath(open ? pathname : null);
  }

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

  return (
    <div className="flex min-h-screen w-full">
      <AppSidebar
        role={role}
        unreadCount={unreadCount}
        mobileOpen={mobileOpen}
        onMobileOpenChange={setMobileOpen}
      />

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header
          className="sticky top-0 z-20 flex items-center gap-3 border-b border-[var(--line)] bg-[rgba(247,250,248,0.92)] px-3 py-2.5 backdrop-blur md:hidden"
          style={{ paddingTop: "max(0.625rem, env(safe-area-inset-top))" }}
        >
          <button
            type="button"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[var(--line)] bg-white/80 text-[var(--ink)]"
            onClick={() => setMobileOpen(true)}
            aria-label={t("common.openMenu")}
            aria-expanded={mobileOpen}
            aria-controls="lexopen-mobile-nav"
          >
            <Menu size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="display truncate text-lg leading-none">LexOpen</div>
            <div className="mt-0.5 truncate text-[10px] uppercase tracking-[0.14em] text-[var(--ink-soft)]/55">
              {t("brand.tagline")}
            </div>
          </div>
          <Link
            href="/notificaciones"
            className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[var(--line)] bg-white/80 text-[var(--ink)]"
            aria-label={t("nav.notifications")}
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 min-w-[1.15rem] rounded-full bg-[var(--copper)] px-1 py-0.5 text-center text-[10px] font-semibold leading-none text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>
        </header>

        <UpdateAvailableBanner
          enabled={showUpdateBanner}
          canSelfUpdate={canSelfUpdate}
        />

        <main
          className="min-w-0 w-full flex-1 px-3 py-4 sm:px-5 sm:py-5 md:px-8 md:py-7"
          style={{
            paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
