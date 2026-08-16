"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Scale,
  LayoutDashboard,
  Briefcase,
  BookOpen,
  Files,
  CalendarClock,
  Puzzle,
  Bot,
  DoorOpen,
  Building2,
  ListTodo,
  CalendarDays,
  Search,
  Users,
  MessageSquare,
  GitBranch,
  Bell,
  CircleDollarSign,
  ClipboardPen,
  Shield,
  Settings,
  Radar,
  ContactRound,
  X,
} from "lucide-react";
import { cn } from "@/lib/chile";
import { UserSwitcher } from "@/components/auth/UserSwitcher";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useI18n } from "@/components/i18n/I18nProvider";
import { useEffect, useMemo, useRef } from "react";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: Array<"admin" | "abogado" | "asistente">;
};

function filterNav(links: NavItem[], role?: string | null) {
  return links.filter(
    (l) => !l.roles || (role != null && l.roles.includes(role as "admin" | "abogado" | "asistente"))
  );
}

function NavGroup({
  title,
  links,
  pathname,
  onNavigate,
}: {
  title: string;
  links: NavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="mb-4">
      <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
        {title}
      </div>
      <div className="flex flex-col gap-0.5">
        {(() => {
          const matches = links.filter(
            (l) => pathname === l.href || pathname.startsWith(`${l.href}/`)
          );
          const best =
            [...matches].sort((a, b) => b.href.length - a.href.length)[0]
              ?.href || null;
          return links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn("nav-link", best === href && "active")}
              onClick={onNavigate}
            >
              <Icon size={16} className="shrink-0" />
              <span className="truncate">{label}</span>
            </Link>
          ));
        })()}
      </div>
    </div>
  );
}

function SidebarChrome({
  role,
  unreadCount,
  onNavigate,
  onClose,
  showClose,
}: {
  role?: string | null;
  unreadCount: number;
  onNavigate?: () => void;
  onClose?: () => void;
  showClose?: boolean;
}) {
  const pathname = usePathname();
  const isCliente = role === "cliente";
  const { t } = useI18n();

  const primary = useMemo<NavItem[]>(
    () => [
      { href: "/dashboard", label: t("nav.home"), icon: LayoutDashboard },
      { href: "/sites", label: t("nav.sites"), icon: Building2 },
      {
        href: "/clientes",
        label: t("nav.clients"),
        icon: ContactRound,
        roles: ["admin", "abogado", "asistente"],
      },
      { href: "/causas", label: t("nav.cases"), icon: Briefcase },
      { href: "/causas/monitoreo", label: t("nav.pjudMonitor"), icon: Radar },
      {
        href: "/causas/mis-causas",
        label: t("nav.misCausas"),
        icon: Shield,
        roles: ["admin", "abogado"],
      },
      { href: "/minutas", label: t("nav.minutes"), icon: ClipboardPen },
      {
        href: "/facturacion",
        label: t("nav.billing"),
        icon: CircleDollarSign,
        roles: ["admin", "abogado", "asistente"],
      },
      { href: "/tareas", label: t("nav.tasks"), icon: ListTodo },
      { href: "/calendario", label: t("nav.calendar"), icon: CalendarDays },
      { href: "/buscar", label: t("nav.search"), icon: Search },
    ],
    [t]
  );

  const collab = useMemo<NavItem[]>(
    () => [
      { href: "/mensajes", label: t("nav.messages"), icon: MessageSquare },
      { href: "/flujos", label: t("nav.workflows"), icon: GitBranch },
      { href: "/personas", label: t("nav.people"), icon: Users },
      { href: "/documentos", label: t("nav.documents"), icon: Files },
      { href: "/plazos", label: t("nav.deadlines"), icon: CalendarClock },
    ],
    [t]
  );

  const intel = useMemo<NavItem[]>(
    () => [
      { href: "/jurisprudencia", label: t("nav.jurisprudence"), icon: BookOpen },
      { href: "/agente", label: t("nav.assistant"), icon: Bot },
      { href: "/portal", label: t("nav.portal"), icon: DoorOpen },
      {
        href: "/integraciones",
        label: t("nav.integrations"),
        icon: Puzzle,
        roles: ["admin", "abogado"],
      },
      { href: "/auditoria", label: t("nav.audit"), icon: Shield, roles: ["admin"] },
      {
        href: "/configuracion",
        label: t("nav.settings"),
        icon: Settings,
        roles: ["admin"],
      },
    ],
    [t]
  );

  const clienteNav = useMemo<NavItem[]>(
    () => [
      { href: "/portal", label: t("nav.portal"), icon: DoorOpen },
      { href: "/sites", label: t("nav.sites"), icon: Building2 },
      { href: "/buscar", label: t("nav.search"), icon: Search },
      { href: "/mensajes", label: t("nav.messages"), icon: MessageSquare },
      { href: "/notificaciones", label: t("nav.notifications"), icon: Bell },
      { href: "/cuenta", label: t("nav.account"), icon: Settings },
    ],
    [t]
  );

  return (
    <>
      <div
        className="border-b border-white/10 px-4 py-4"
        style={
          showClose
            ? { paddingTop: "max(1rem, env(safe-area-inset-top))" }
            : undefined
        }
      >
        <div className="flex items-start gap-2">
          <Link
            href="/"
            className="flex min-w-0 flex-1 items-center gap-3"
            onClick={onNavigate}
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[linear-gradient(135deg,#c47a3a,#9a5a28)] shadow-[0_10px_24px_rgba(196,122,58,0.35)]">
              <Scale size={18} />
            </span>
            <div className="min-w-0">
              <div className="display text-xl leading-none">LexOpen</div>
              <div className="mt-1 truncate text-[11px] uppercase tracking-[0.16em] text-white/55">
                {t("brand.tagline")}
              </div>
            </div>
          </Link>
          {showClose && (
            <button
              type="button"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-white"
              onClick={onClose}
              aria-label={t("common.closeMenu")}
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto overscroll-contain p-3">
        {isCliente ? (
          <NavGroup
            title={t("nav.groups.portal")}
            links={clienteNav}
            pathname={pathname}
            onNavigate={onNavigate}
          />
        ) : (
          <>
            <NavGroup
              title={t("nav.groups.workspace")}
              links={filterNav(primary, role)}
              pathname={pathname}
              onNavigate={onNavigate}
            />
            <NavGroup
              title={t("nav.groups.collab")}
              links={filterNav(collab, role)}
              pathname={pathname}
              onNavigate={onNavigate}
            />
            <NavGroup
              title={t("nav.groups.intel")}
              links={filterNav(intel, role)}
              pathname={pathname}
              onNavigate={onNavigate}
            />
          </>
        )}
      </nav>

      <div
        className="space-y-2 border-t border-white/10 p-3"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <LanguageSwitcher variant="dark" className="w-full px-2" />
        <Link href="/notificaciones" className="nav-link" onClick={onNavigate}>
          <Bell size={16} className="shrink-0" />
          <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
            <span className="truncate">{t("nav.notifications")}</span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-[var(--copper)] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </span>
        </Link>
        <UserSwitcher />
      </div>
    </>
  );
}

export function AppSidebar({
  role,
  unreadCount = 0,
  mobileOpen = false,
  onMobileOpenChange,
}: {
  role?: string | null;
  unreadCount?: number;
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const drawerRef = useRef<HTMLElement>(null);
  const close = () => onMobileOpenChange?.(false);

  useEffect(() => {
    if (!mobileOpen) return;
    const root = drawerRef.current;
    if (!root) return;
    const focusable = root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    first?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || focusable.length === 0) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  return (
    <>
      <div className="sticky top-0 hidden h-screen shrink-0 md:block">
        <aside className="flex h-full w-[240px] shrink-0 flex-col bg-[linear-gradient(180deg,#0c1c24_0%,#14313d_55%,#1a3d3f_100%)] text-white">
          <SidebarChrome role={role} unreadCount={unreadCount} />
        </aside>
      </div>

      <div
        className={cn(
          "fixed inset-0 z-40 md:hidden",
          mobileOpen ? "pointer-events-auto" : "pointer-events-none"
        )}
        aria-hidden={!mobileOpen}
      >
        <button
          type="button"
          className={cn(
            "absolute inset-0 bg-black/45 transition-opacity duration-200",
            mobileOpen ? "opacity-100" : "opacity-0"
          )}
          aria-label={t("common.closeMenu")}
          tabIndex={mobileOpen ? 0 : -1}
          onClick={close}
        />
        <aside
          ref={drawerRef}
          id="lexopen-mobile-nav"
          className={cn(
            "absolute left-0 top-0 flex h-full w-[min(20rem,88vw)] flex-col bg-[linear-gradient(180deg,#0c1c24_0%,#14313d_55%,#1a3d3f_100%)] text-white shadow-2xl transition-transform duration-200 ease-out",
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          )}
          role="dialog"
          aria-modal="true"
          aria-label={t("common.menu")}
        >
          <SidebarChrome
            role={role}
            unreadCount={unreadCount}
            onNavigate={close}
            onClose={close}
            showClose
          />
        </aside>
      </div>
    </>
  );
}
