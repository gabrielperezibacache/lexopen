"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  Inbox, LayoutDashboard, Home, Briefcase, BookOpen, Files, CalendarClock, Puzzle,
  Bot, DoorOpen, Building2, ListTodo, CalendarDays, Search, Users, MessageSquare,
  GitBranch, Bell, CircleDollarSign, ClipboardPen, Shield, Settings, ContactRound,
  AudioLines, X, PanelLeftClose, PanelLeftOpen, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/chile";
import { FolioSymbol } from "@/components/ui/FolioSymbol";
import { UserSwitcher, type SessionUserSummary } from "@/components/auth/UserSwitcher";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useI18n } from "@/components/i18n/I18nProvider";
import {
  activeNavigationArea, activeNavigationEntry, secondaryNavigation,
  type NavigationEntry, type NavigationIcon, type NavigationModel,
} from "@/lib/navigation/catalog";

const ICONS: Record<NavigationIcon, LucideIcon> = {
  home: Home, cases: Briefcase, calendar: CalendarDays, library: BookOpen, clients: ContactRound,
  inbox: Inbox, studio: Building2, files: Files, minutes: ClipboardPen, deadlines: CalendarClock,
  tasks: ListTodo, hearings: AudioLines, research: BookOpen, portal: DoorOpen, messages: MessageSquare,
  billing: CircleDollarSign, people: Users, spaces: Building2, workflows: GitBranch, settings: Settings,
  integrations: Puzzle, audit: Shield, assistant: Bot, search: Search, notifications: Bell, account: Settings,
  monitor: LayoutDashboard,
};

function Count({ value, compact = false }: { value: number; compact?: boolean }) {
  if (value <= 0) return null;
  return <span aria-hidden="true" className={cn("shell-nav-count", compact && "shell-nav-count-compact")}>{value > 99 ? "99+" : value}</span>;
}

function SidebarChrome({ navigation, user, mailPendingCount, onNavigate, onClose, showClose, collapsed, onToggleCollapse }: {
  navigation: NavigationModel;
  user?: SessionUserSummary;
  mailPendingCount: number;
  onNavigate?: () => void;
  onClose?: () => void;
  showClose?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const pathname = usePathname() || "/";
  const { t } = useI18n();
  const activeArea = activeNavigationArea(navigation, pathname);
  const activeEntry = activeNavigationEntry(navigation, pathname);
  const secondary = secondaryNavigation(navigation, pathname);
  const assistant = navigation.utilities.find(item => item.id === "agente");
  const shortcutEntries = activeArea?.id === "jornada" ? navigation.shortcuts : [];

  function entryLink(entry: NavigationEntry, compact = false) {
    const Icon = ICONS[entry.icon];
    const count = entry.badge === "mail" ? mailPendingCount : 0;
    const label = t(entry.labelKey);
    return <Link key={entry.id} href={entry.href}
      className={cn("nav-link shell-secondary-link", compact && "shell-nav-compact", activeEntry?.id === entry.id && "active")}
      aria-current={activeEntry?.id === entry.id ? "page" : undefined}
      aria-label={count > 0 ? `${label}: ${count} ${t("nav.pendingItems")}` : label}
      title={compact ? label : undefined} onClick={onNavigate}>
      <Icon size={16} aria-hidden="true" className="shrink-0" />
      <span className={cn("min-w-0 flex-1", compact && "sr-only")}>{label}</span>
      <Count value={count} compact={compact} />
    </Link>;
  }

  return <>
    <div className={cn("shell-sidebar-brand border-b border-white/10", collapsed && "shell-sidebar-brand-compact")}
      style={showClose ? { paddingTop: "max(1rem, env(safe-area-inset-top))" } : undefined}>
      <Link href={navigation.mode === "portal" ? "/portal" : "/inicio"} className="flex min-w-0 flex-1 items-center gap-3" onClick={onNavigate} aria-label="LexOpen">
        <span className="folio-brand grid h-10 w-10 shrink-0 place-items-center rounded-xl"><FolioSymbol className="h-7 w-7" /></span>
        {!collapsed && <span className="display text-xl leading-none">LexOpen</span>}
      </Link>
      {showClose && <button type="button" className="shell-sidebar-toggle" onClick={onClose} aria-label={t("common.closeMenu")}><X size={18} aria-hidden="true" /></button>}
      {onToggleCollapse && !showClose && <button type="button" className="shell-sidebar-toggle" onClick={onToggleCollapse}
        aria-label={collapsed ? t("common.expandSidebar") : t("common.collapseSidebar")} aria-expanded={!collapsed}>
        {collapsed ? <PanelLeftOpen size={16} aria-hidden="true" /> : <PanelLeftClose size={16} aria-hidden="true" />}
      </button>}
    </div>

    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 md:p-3">
      <nav aria-label={t(navigation.mode === "portal" ? "nav.groups.portal" : "nav.mainNavigation")} data-testid="primary-navigation" className="flex flex-col gap-1">
        {navigation.mode === "portal" ? navigation.entries.map(entry => entryLink(entry, collapsed)) : navigation.areas.map(area => {
          const Icon = ICONS[area.icon];
          const count = area.id === "comunicaciones" ? mailPendingCount : 0;
          const label = t(area.labelKey);
          return <Link key={area.id} href={area.href} data-area={area.id}
            className={cn("nav-link shell-area-link", collapsed && "shell-nav-compact", activeArea?.id === area.id && "active")}
            aria-current={activeArea?.id === area.id ? "location" : undefined}
            aria-label={count > 0 ? `${label}: ${count} ${t("nav.pendingItems")}` : label}
            title={collapsed ? label : undefined} onClick={onNavigate}>
            <Icon size={18} aria-hidden="true" className="shrink-0" />
            <span className={cn("min-w-0 flex-1", collapsed && "sr-only")}>{label}</span>
            <Count value={count} compact={collapsed} />
          </Link>;
        })}
      </nav>
      {secondary.length > 1 && !collapsed && <nav aria-label={t(activeArea!.labelKey)} data-testid="secondary-navigation" className="shell-secondary-nav">
        {secondary.map((entry, index) => <div key={entry.id}>
          {entry.groupKey && entry.groupKey !== secondary[index - 1]?.groupKey && <p className="shell-nav-group">{t(entry.groupKey)}</p>}
          {entryLink(entry)}
        </div>)}
      </nav>}
      {shortcutEntries.length > 0 && !collapsed && <nav aria-label={t("nav.shortcuts")} className="shell-secondary-nav">
        <p className="shell-nav-group">{t("nav.shortcuts")}</p>{shortcutEntries.map(entry => entryLink(entry))}
      </nav>}
    </div>

    <div className={cn("shell-sidebar-footer border-t border-white/10", collapsed && "shell-sidebar-footer-compact")}
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
      {assistant && entryLink(assistant, collapsed)}
      {!collapsed && <div className="flex items-center gap-2"><LanguageSwitcher variant="dark" className="min-w-0 flex-1 px-2" /><ThemeToggle variant="dark" /></div>}
      <UserSwitcher initialUser={user} compact={collapsed} />
    </div>
  </>;
}

export function AppSidebar({ navigation, user, mailPendingCount = 0, mobileOpen = false, onMobileOpenChange, collapsed = false, onCollapsedChange }: {
  navigation: NavigationModel;
  user?: SessionUserSummary;
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
    const focusable = () => Array.from(root.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])')).filter(el => el.getClientRects().length > 0);
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [mobileOpen]);

  return <>
    <div className="sticky top-0 hidden h-dvh shrink-0 md:block" data-testid="desktop-sidebar">
      <aside className={cn("sidebar-surface shell-sidebar flex h-full shrink-0 flex-col text-white", collapsed ? "w-[76px]" : "w-[252px]")}>
        <SidebarChrome navigation={navigation} user={user} mailPendingCount={mailPendingCount} collapsed={collapsed} onToggleCollapse={() => onCollapsedChange?.(!collapsed)} />
      </aside>
    </div>
    <div className={cn("fixed inset-0 z-40 md:hidden", mobileOpen ? "pointer-events-auto" : "pointer-events-none")} aria-hidden={!mobileOpen} inert={!mobileOpen}>
      <button type="button" className={cn("absolute inset-0 bg-black/45 transition-opacity duration-[var(--motion-base)]", mobileOpen ? "opacity-100" : "opacity-0")}
        aria-label={t("common.closeMenu")} tabIndex={mobileOpen ? 0 : -1} onClick={close} />
      <aside ref={drawerRef} id="lexopen-mobile-nav" className={cn("sidebar-surface absolute left-0 top-0 flex h-dvh w-[min(20rem,88vw)] flex-col text-white shadow-2xl transition-transform duration-[var(--motion-base)] ease-out", mobileOpen ? "translate-x-0" : "-translate-x-full")}
        role="dialog" aria-modal="true" aria-label={t("common.menu")}>
        <SidebarChrome navigation={navigation} user={user} mailPendingCount={mailPendingCount} onNavigate={close} onClose={close} showClose />
      </aside>
    </div>
  </>;
}
