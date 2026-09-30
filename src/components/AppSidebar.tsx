"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Scale,
  Inbox,
  LayoutDashboard,
  Home,
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
  ContactRound,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/chile";
import { UserSwitcher } from "@/components/auth/UserSwitcher";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useI18n } from "@/components/i18n/I18nProvider";
import { useEffect, useMemo, useRef } from "react";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: Array<"admin" | "abogado" | "asistente">;
  badge?: number;
};

function filterNav(links: NavItem[], role?: string | null) {
  return links.filter(
    (l) =>
      !l.roles ||
      (role != null && l.roles.includes(role as "admin" | "abogado" | "asistente"))
  );
}

function NavGroup({
  title,
  links,
  pathname,
  onNavigate,
  collapsed,
}: {
  title: string;
  links: NavItem[];
  pathname: string;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  if (links.length === 0) return null;
  return (
    <div className="mb-4">
      {!collapsed && (
        <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
          {title}
        </div>
      )}
      <div className="flex flex-col gap-0.5">
        {(() => {
          const matches = links.filter(
            (l) => pathname === l.href || pathname.startsWith(`${l.href}/`)
          );
          const best =
            [...matches].sort((a, b) => b.href.length - a.href.length)[0]
              ?.href || null;
          return links.map(({ href, label, icon: Icon, badge }) => (
            <Link
              key={href}
              href={href}
              className={cn("nav-link", collapsed && "justify-center px-2", best === href && "active")}
              aria-current={best === href ? "page" : undefined}
              onClick={onNavigate}
              title={collapsed ? label : undefined}
            >
              <Icon size={16} className="shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
              {!collapsed && badge != null && badge > 0 && (
                <span className="ml-auto min-w-[1.15rem] rounded-full bg-[var(--copper)] px-1 py-0.5 text-center text-[10px] font-semibold leading-none text-white">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
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
  mailPendingCount = 0,
  onNavigate,
  onClose,
  showClose,
  collapsed,
  onToggleCollapse,
}: {
  role?: string | null;
  unreadCount: number;
  mailPendingCount?: number;
  onNavigate?: () => void;
  onClose?: () => void;
  showClose?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const pathname = usePathname();
  const isCliente = role === "cliente";
  const { t } = useI18n();

  const work = useMemo<NavItem[]>(
    () => [
      { href: "/inicio", label: t("nav.home"), icon: Home },
      { href: "/causas", label: t("nav.cases"), icon: Briefcase },
      { href: "/plazos", label: t("nav.deadlines"), icon: CalendarClock },
      { href: "/calendario", label: t("nav.calendar"), icon: CalendarDays },
      { href: "/tareas", label: t("nav.tasks"), icon: ListTodo },
      { href: "/dashboard", label: t("nav.panel"), icon: LayoutDashboard },
      {
        href: "/correo",
        label: t("nav.mailbox"),
        icon: Inbox,
        roles: ["admin", "abogado", "asistente"],
        badge: mailPendingCount,
      },
    ],
    [t, mailPendingCount]
  );

  const clients = useMemo<NavItem[]>(
    () => [
      {
        href: "/clientes",
        label: t("nav.clients"),
        icon: ContactRound,
        roles: ["admin", "abogado", "asistente"],
      },
      { href: "/portal", label: t("nav.portal"), icon: DoorOpen },
      { href: "/sites", label: t("nav.sites"), icon: Building2 },
      { href: "/mensajes", label: t("nav.messages"), icon: MessageSquare },
      { href: "/personas", label: t("nav.people"), icon: Users },
      { href: "/flujos", label: t("nav.workflows"), icon: GitBranch },
    ],
    [t]
  );

  const documents = useMemo<NavItem[]>(
    () => [
      { href: "/documentos", label: t("nav.documents"), icon: Files },
      { href: "/minutas", label: t("nav.minutes"), icon: ClipboardPen },
      { href: "/jurisprudencia", label: t("nav.jurisprudence"), icon: BookOpen },
      { href: "/agente", label: t("nav.assistant"), icon: Bot },
      { href: "/buscar", label: t("nav.search"), icon: Search },
    ],
    [t]
  );

  const admin = useMemo<NavItem[]>(
    () => [
      {
        href: "/facturacion",
        label: t("nav.billing"),
        icon: CircleDollarSign,
        roles: ["admin", "abogado", "asistente"],
      },
      {
        href: "/configuracion",
        label: t("nav.settings"),
        icon: Settings,
        roles: ["admin"],
      },
      {
        href: "/integraciones",
        label: t("nav.integrations"),
        icon: Puzzle,
        roles: ["admin", "abogado"],
      },
      { href: "/auditoria", label: t("nav.audit"), icon: Shield, roles: ["admin"] },
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
        className={cn("border-b border-white/10 px-3 py-4", collapsed && "px-2")}
        style={
          showClose
            ? { paddingTop: "max(1rem, env(safe-area-inset-top))" }
            : undefined
        }
      >
        <div className="flex items-start gap-2">
          <Link
            href="/"
            className={cn("flex min-w-0 flex-1 items-center gap-3", collapsed && "justify-center")}
            onClick={onNavigate}
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[linear-gradient(135deg,#c47a3a,#9a5a28)] shadow-[0_10px_24px_rgba(196,122,58,0.35)]">
              <Scale size={18} />
            </span>
            {!collapsed && (
              <div className="min-w-0">
                <div className="display text-xl leading-none">LexOpen</div>
                <div className="mt-1 truncate text-[11px] uppercase tracking-[0.16em] text-white/55">
                  {t("brand.tagline")}
                </div>
              </div>
            )}
          </Link>
          {showClose && (
            <button
              type="button"
              className="grid min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-xl bg-white/10 text-white"
              onClick={onClose}
              aria-label={t("common.closeMenu")}
            >
              <X size={18} />
            </button>
          )}
          {onToggleCollapse && !showClose && (
            <button
              type="button"
              className="grid min-h-[40px] min-w-[40px] shrink-0 place-items-center rounded-xl bg-white/10 text-white"
              onClick={onToggleCollapse}
              aria-label={
                collapsed ? t("common.expandSidebar") : t("common.collapseSidebar")
              }
              aria-expanded={!collapsed}
            >
              {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
          )}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto overscroll-contain p-2 md:p-3">
        {isCliente ? (
          <NavGroup
            title={t("nav.groups.portal")}
            links={clienteNav}
            pathname={pathname}
            onNavigate={onNavigate}
            collapsed={collapsed}
          />
        ) : (
          <>
            <NavGroup
              title={t("nav.groups.work")}
              links={filterNav(work, role)}
              pathname={pathname}
              onNavigate={onNavigate}
              collapsed={collapsed}
            />
            <NavGroup
              title={t("nav.groups.clients")}
              links={filterNav(clients, role)}
              pathname={pathname}
              onNavigate={onNavigate}
              collapsed={collapsed}
            />
            <NavGroup
              title={t("nav.groups.documents")}
              links={filterNav(documents, role)}
              pathname={pathname}
              onNavigate={onNavigate}
              collapsed={collapsed}
            />
            <NavGroup
              title={t("nav.groups.admin")}
              links={filterNav(admin, role)}
              pathname={pathname}
              onNavigate={onNavigate}
              collapsed={collapsed}
            />
          </>
        )}
      </nav>

      <div
        className={cn("space-y-2 border-t border-white/10 p-3", collapsed && "px-2")}
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        {!collapsed && <LanguageSwitcher variant="dark" className="w-full px-2" />}
        <div className={cn("flex gap-2", collapsed && "flex-col items-center")}>
          <ThemeToggle variant="dark" />
          <Link
            href="/notificaciones"
            className={cn("nav-link flex-1", collapsed && "justify-center px-2")}
            onClick={onNavigate}
            title={t("nav.notifications")}
          >
            <Bell size={16} className="shrink-0" />
            {!collapsed && (
              <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                <span className="truncate">{t("nav.notifications")}</span>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-[var(--copper)] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </span>
            )}
          </Link>
        </div>
        {!collapsed && <UserSwitcher />}
      </div>
    </>
  );
}

export function AppSidebar({
  role,
  unreadCount = 0,
  mailPendingCount = 0,
  mobileOpen = false,
  onMobileOpenChange,
  collapsed = false,
  onCollapsedChange,
}: {
  role?: string | null;
  unreadCount?: number;
  mailPendingCount?: number;
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}) {
  const { t } = useI18n();
  const drawerRef = useRef<HTMLElement>(null);
  const close = () => onMobileOpenChange?.(false);

  useEffect(() => {
    if (!mobileOpen) return;
    const root = drawerRef.current;
    if (!root) return;
    const previousFocus = document.activeElement;
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
    return () => {
      document.removeEventListener("keydown", onKey);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, [mobileOpen]);

  return (
    <>
      <div className="sticky top-0 hidden h-screen shrink-0 md:block">
        <aside
          className={cn(
            "sidebar-surface flex h-full shrink-0 flex-col text-white transition-[width] duration-[var(--motion-base)] ease-out",
            collapsed ? "w-[72px]" : "w-[240px]"
          )}
        >
          <SidebarChrome
            role={role}
            unreadCount={unreadCount}
            mailPendingCount={mailPendingCount}
            collapsed={collapsed}
            onToggleCollapse={() => onCollapsedChange?.(!collapsed)}
          />
        </aside>
      </div>

      <div
        className={cn(
          "fixed inset-0 z-40 md:hidden",
          mobileOpen ? "pointer-events-auto" : "pointer-events-none"
        )}
        aria-hidden={!mobileOpen}
        inert={!mobileOpen}
      >
        <button
          type="button"
          className={cn(
            "absolute inset-0 bg-black/45 transition-opacity duration-[var(--motion-base)]",
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
            "sidebar-surface absolute left-0 top-0 flex h-full w-[min(20rem,88vw)] flex-col text-white shadow-2xl transition-transform duration-[var(--motion-base)] ease-out",
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          )}
          role="dialog"
          aria-modal="true"
          aria-label={t("common.menu")}
        >
          <SidebarChrome
            role={role}
            unreadCount={unreadCount}
            mailPendingCount={mailPendingCount}
            onNavigate={close}
            onClose={close}
            showClose
          />
        </aside>
      </div>
    </>
  );
}
