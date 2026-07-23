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
} from "lucide-react";
import { cn } from "@/lib/chile";
import { UserSwitcher } from "@/components/auth/UserSwitcher";

const primary = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/sites", label: "Sites", icon: Building2 },
  { href: "/causas", label: "Causas Chile", icon: Briefcase },
  { href: "/facturacion", label: "Facturación", icon: CircleDollarSign },
  { href: "/tareas", label: "Tasks", icon: ListTodo },
  { href: "/calendario", label: "Calendar", icon: CalendarDays },
  { href: "/buscar", label: "Search", icon: Search },
];

const collab = [
  { href: "/mensajes", label: "Messages", icon: MessageSquare },
  { href: "/flujos", label: "Workflows", icon: GitBranch },
  { href: "/personas", label: "People", icon: Users },
  { href: "/documentos", label: "Files hub", icon: Files },
  { href: "/plazos", label: "Plazos", icon: CalendarClock },
];

const intel = [
  { href: "/jurisprudencia", label: "Jurisprudencia", icon: BookOpen },
  { href: "/agente", label: "Hermes Agent", icon: Bot },
  { href: "/portal", label: "Client portal", icon: DoorOpen },
  { href: "/integraciones", label: "Integraciones", icon: Puzzle },
];

function NavGroup({
  title,
  links,
  pathname,
}: {
  title: string;
  links: typeof primary;
  pathname: string;
}) {
  return (
    <div className="mb-4">
      <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
        {title}
      </div>
      <div className="flex flex-col gap-0.5">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link key={href} href={href} className={cn("nav-link", active && "active")}>
              <Icon size={16} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-[270px] shrink-0 flex-col bg-[linear-gradient(180deg,#0c1c24_0%,#14313d_55%,#1a3d3f_100%)] text-white">
      <div className="border-b border-white/10 px-5 py-5">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[linear-gradient(135deg,#c47a3a,#9a5a28)] shadow-[0_10px_24px_rgba(196,122,58,0.35)]">
            <Scale size={18} />
          </span>
          <div>
            <div className="display text-xl leading-none">LexOpen</div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-white/55">
              Open HighQ · Chile
            </div>
          </div>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        <NavGroup title="Workspace" links={primary} pathname={pathname} />
        <NavGroup title="Colaboración" links={collab} pathname={pathname} />
        <NavGroup title="Inteligencia" links={intel} pathname={pathname} />
      </nav>

      <div className="space-y-2 border-t border-white/10 p-3">
        <Link href="/mensajes" className="nav-link">
          <Bell size={16} />
          <span>Notificaciones</span>
        </Link>
        <UserSwitcher />
      </div>
    </aside>
  );
}
