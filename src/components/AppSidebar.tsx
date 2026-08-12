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
  Menu,
  Shield,
  Settings,
  Radar,
} from "lucide-react";
import { cn } from "@/lib/chile";
import { UserSwitcher } from "@/components/auth/UserSwitcher";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useI18n } from "@/components/i18n/I18nProvider";
import { useMemo, useState } from "react";

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
              <Icon size={16} />
              <span>{label}</span>
            </Link>
          ));
        })()}
      </div>
    </div>
  );
}

export function AppSidebar({
  role,
  unreadCount = 0,
}: {
  role?: string | null;
  unreadCount?: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isCliente = role === "cliente";
  const { t } = useI18n();

  const primary = useMemo<NavItem[]>(
    () => [
      { href: "/dashboard", label: t("nav.home"), icon: LayoutDashboard },
      { href: "/sites", label: t("nav.sites"), icon: Building2 },
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
      { href: "/notificaciones", label: t("nav.notifications"), icon: Bell },
      { href: "/cuenta", label: t("nav.account"), icon: Settings },
    ],
    [t]
  );

  const nav = (
    <>
      <div className="border-b border-white/10 px-5 py-5">
        <Link href="/" className="flex items-center gap-3" onClick={() => setOpen(false)}>
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[linear-gradient(135deg,#c47a3a,#9a5a28)] shadow-[0_10px_24px_rgba(196,122,58,0.35)]">
            <Scale size={18} />
          </span>
          <div>
            <div className="display text-xl leading-none">LexOpen</div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-white/55">
              {t("brand.tagline")}
            </div>
          </div>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        {isCliente ? (
          <NavGroup
            title={t("nav.groups.portal")}
            links={clienteNav}
            pathname={pathname}
            onNavigate={() => setOpen(false)}
          />
        ) : (
          <>
            <NavGroup
              title={t("nav.groups.workspace")}
              links={filterNav(primary, role)}
              pathname={pathname}
              onNavigate={() => setOpen(false)}
            />
            <NavGroup
              title={t("nav.groups.collab")}
              links={filterNav(collab, role)}
              pathname={pathname}
              onNavigate={() => setOpen(false)}
            />
            <NavGroup
              title={t("nav.groups.intel")}
              links={filterNav(intel, role)}
              pathname={pathname}
              onNavigate={() => setOpen(false)}
            />
          </>
        )}
      </nav>

      <div className="space-y-2 border-t border-white/10 p-3">
        <LanguageSwitcher variant="dark" className="w-full px-2" />
        <Link href="/notificaciones" className="nav-link" onClick={() => setOpen(false)}>
          <Bell size={16} />
          <span className="flex flex-1 items-center justify-between gap-2">
            {t("nav.notifications")}
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

  return (
    <>
      <button
        type="button"
        data-mobile-nav-toggle
        className="fixed bottom-4 right-4 z-40 grid h-12 w-12 place-items-center rounded-full bg-[var(--ink)] text-white shadow-lg md:hidden"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("common.openMenu")}
        aria-expanded={open}
      >
        <Menu size={20} />
      </button>

      {open && (
        <div className="fixed inset-0 z-30 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label={t("common.closeMenu")}
            onClick={() => setOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-[270px] flex-col bg-[linear-gradient(180deg,#0c1c24_0%,#14313d_55%,#1a3d3f_100%)] text-white shadow-xl">
            {nav}
          </aside>
        </div>
      )}

      <aside className="hidden h-full w-[270px] shrink-0 flex-col bg-[linear-gradient(180deg,#0c1c24_0%,#14313d_55%,#1a3d3f_100%)] text-white md:flex">
        {nav}
      </aside>
    </>
  );
}
