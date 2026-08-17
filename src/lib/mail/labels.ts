import type { MailKind } from "@/lib/mail/parse";

const ES: Record<MailKind, string> = {
  resolucion: "Resolución",
  causa_general: "Causa",
  tablas: "Tabla / audiencia",
  otro: "Otro",
};

const EN: Record<MailKind, string> = {
  resolucion: "Resolution",
  causa_general: "Matter",
  tablas: "Hearing schedule",
  otro: "Other",
};

export function mailKindLabel(kind: string, locale: "es" | "en" = "es") {
  const map = locale === "en" ? EN : ES;
  return map[kind as MailKind] || kind;
}
