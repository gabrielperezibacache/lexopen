import Link from "next/link";
import { notFound } from "next/navigation";
import { DeadlineCard, deadlineCardRelations } from "@/components/DeadlineCard";
import { requireStaff } from "@/lib/auth/session";
import { plazoAccessWhere } from "@/lib/auth/causa-access";
import { civilDateKey } from "@/lib/chile-time";
import { deadlineOrigin } from "@/lib/deadlines/navigation";
import { getI18n } from "@/lib/i18n/server";
import { prisma } from "@/lib/db";

export default async function DeadlinePage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ volver?: string | string[] }>;
}) {
  const user = await requireStaff();
  const { id } = await params;
  const row = await prisma.plazo.findFirst({
    where: { AND: [{ id }, plazoAccessWhere(user)] },
    include: deadlineCardRelations(user.id),
  });
  if (!row) notFound();
  const { dict, locale } = await getI18n();
  const origin = deadlineOrigin((await searchParams).volver, row.id, row.causaId);
  const month = new URLSearchParams({ mes: civilDateKey(row.fechaLimite).slice(0, 7) });
  if (row.causaId) month.set("causaId", row.causaId);
  const label = origin?.startsWith("/calendario") ? ["Volver al calendario", "Back to calendar"]
    : origin?.startsWith("/causas/") || origin?.startsWith("/pjud/") ? ["Volver a la causa", "Back to case"]
    : origin ? ["Volver a plazos", "Back to deadlines"] : ["Ver plazos del mes", "View deadlines for this month"];
  return <div className="space-y-4">
    <Link className="text-sm text-[var(--sea)] underline" href={origin || `/plazos?${month}`}>{label[locale === "en" ? 1 : 0]}</Link>
    <DeadlineCard deadline={row} user={user} labels={dict.hubs.plazos} />
  </div>;
}
