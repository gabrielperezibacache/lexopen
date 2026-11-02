"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n/I18nProvider";
import { useEffect, useRef } from "react";

export function BillingNav() {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const { locale } = useI18n();
  const english = locale === "en";
  const items = [
    { href: "/facturacion", label: english ? "Overview" : "Resumen" },
    { href: "/facturacion/horas", label: english ? "Hours" : "Horas" },
    { href: "/facturacion/gastos", label: english ? "Expenses" : "Gastos" },
    { href: "/facturacion/facturas", label: english ? "Invoices" : "Facturas y boletas" },
    { href: "/facturacion/cuenta-corriente", label: english ? "Client ledger" : "Cuenta corriente" },
    { href: "/facturacion/tarifas", label: english ? "Rates" : "Tarifas" },
    { href: "/facturacion/uf", label: "UF" },
  ];

  useEffect(() => {
    const nav = navRef.current;
    const selected = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav && selected) nav.scrollLeft += selected.getBoundingClientRect().left - nav.getBoundingClientRect().left - 8;
  }, [pathname]);

  return (
    <nav ref={navRef} aria-label={english ? "Billing sections" : "Secciones de facturación"} className="max-w-full overflow-x-auto overscroll-x-contain border-b border-[var(--line)] [scrollbar-width:thin]">
      <div className="flex min-w-max gap-1 pb-2">
        {items.map(({ href, label }) => {
          const active = href === "/facturacion" ? pathname === href : pathname.startsWith(href);
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-medium whitespace-nowrap transition-colors ${active ? "bg-[var(--sea-soft)] text-[var(--sea)]" : "text-[var(--ink-soft)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"}`}>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
