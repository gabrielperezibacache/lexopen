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
} from "lucide-react";
import { cn } from "@/lib/chile";
import { UserSwitcher } from "@/components/auth/UserSwitcher";
import { useState } from "react";

const primary = [
  { href: "/dashboard", label: "Inicio", icon: LayoutDashboard },
  { href: "/sites", label: "Espacios", icon: Building2 },
  { href: "/causas", label: "Causas", icon: Briefcase },
  { href: "/minutas", label: "Minutas", icon: ClipboardPen },
  { href: "/facturacion", label: "Facturación", icon: CircleDollarSign },
  { href: "/tareas", label: "Tareas", icon: ListTodo },
  { href: "/calendario", label: "Calendario", icon: CalendarDays },
  { href: "/buscar", label: "Buscar", icon: Search },
];

const collab = [
  { href: "/mensajes", label: "Mensajes", icon: MessageSquare },
  { href: "/flujos", label: "Flujos", icon: GitBranch },
  { href: "/personas", label: "Personas", icon: Users },
  { href: "/documentos", label: "Documentos", icon: Files },
  { href: "/plazos", label: "Plazos", icon: CalendarClock },
];

const intel = [
  { href: "/jurisprudencia", label: "Jurisprudencia", icon: BookOpen },
  { href: "/agente", label: "Agente Hermes", icon: Bot },
  { href: "/portal", label: "Portal cliente", icon: DoorOpen },
  { href: "/integraciones", label: "Integraciones", icon: Puzzle },
];

const clienteNav = [
  { href: "/portal", label: "Portal cliente", icon: DoorOpen },
  { href: "/sites", label: "Espacios", icon: Building2 },
];

function NavGroup({
  title,
  links,
  pathname,
  onNavigate,
}: {
  title: string;
  links: typeof primary;
  pathname: string;
  onNavigate?: () => void;
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
            <Link
              key={href}
              href={href}
              className={cn("nav-link", active && "active")}
              onClick={onNavigate}
            >
              <Icon size={16} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function AppSidebar({ role }: { role?: string | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isCliente = role === "cliente";

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
              Estudio · Chile
            </div>
          </div>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        {isCliente ? (
          <NavGroup title="Portal" links={clienteNav} pathname={pathname} onNavigate={() => setOpen(false)} />
        ) : (
          <>
            <NavGroup title="Espacio de trabajo" links={primary} pathname={pathname} onNavigate={() => setOpen(false)} />
            <NavGroup title="Colaboración" links={collab} pathname={pathname} onNavigate={() => setOpen(false)} />
            <NavGroup title="Inteligencia" links={intel} pathname={pathname} onNavigate={() => setOpen(false)} />
          </>
        )}
      </nav>

      <div className="space-y-2 border-t border-white/10 p-3">
        {!isCliente && (
          <Link href="/notificaciones" className="nav-link" onClick={() => setOpen(false)}>
            <Bell size={16} />
            <span>Notificaciones</span>
          </Link>
        )}
        <UserSwitcher />
      </div>
    </>
  );

  return (
    <>
      <button
        type="button"
        className="fixed bottom-4 right-4 z-40 grid h-12 w-12 place-items-center rounded-full bg-[var(--ink)] text-white shadow-lg md:hidden"
        onClick={() => setOpen((v) => !v)}
        aria-label="Abrir menú"
        aria-expanded={open}
      >
        <Menu size={20} />
      </button>

      {open && (
        <div className="fixed inset-0 z-30 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Cerrar menú"
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
