import { cn } from "@/lib/chile";
import type { ReactNode } from "react";

type Tone = "ink" | "sea" | "copper" | "ok" | "warn" | "danger" | "activa" | "pendiente" | "vencido";

const toneClass: Record<Tone, string> = {
  ink: "badge-ink",
  sea: "badge-sea",
  copper: "badge-copper",
  ok: "badge-activa",
  warn: "badge-pendiente",
  danger: "badge-vencido",
  activa: "badge-activa",
  pendiente: "badge-pendiente",
  vencido: "badge-vencido",
};

export function Badge({
  tone = "ink",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return <span className={cn("badge", toneClass[tone], className)}>{children}</span>;
}
