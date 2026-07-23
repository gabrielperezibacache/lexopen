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
} from "lucide-react";
import { cn } from "@/lib/chile";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/causas", label: "Causas", icon: Briefcase },
  { href: "/jurisprudencia", label: "Jurisprudencia", icon: BookOpen },
  { href: "/documentos", label: "Documentos", icon: Files },
  { href: "/plazos", label: "Plazos", icon: CalendarClock },
  { href: "/agente", label: "Hermes Agent", icon: Bot },
  { href: "/portal", label: "Portal cliente", icon: DoorOpen },
  { href: "/integraciones", label: "Integraciones", icon: Puzzle },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col bg-[linear-gradient(180deg,#0c1c24_0%,#14313d_55%,#1a3d3f_100%)] text-white">
      <div className="border-b border-white/10 px-5 py-6">
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

      <nav className="flex flex-1 flex-col gap-1 p-3">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn("nav-link", active && "active")}
            >
              <Icon size={17} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="m-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
        <div className="text-xs uppercase tracking-[0.14em] text-white/45">
          Estudio demo
        </div>
        <div className="mt-1 font-medium text-white">Contreras & Valenzuela</div>
        <div className="mt-1 text-xs">Santiago · Código abierto AGPL-3.0</div>
      </div>
    </aside>
  );
}
