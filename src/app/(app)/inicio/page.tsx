import { getI18n } from "@/lib/i18n/server";
import { Suspense } from "react";
import { AltazorHome } from "@/components/altazor/AltazorHome";
import { DayOverview } from "@/components/inicio/DayOverview";
import { requireStaff } from "@/lib/auth/session";
import { canSome } from "@/lib/auth/permissions";

export default async function InicioPage() {
  const user = await requireStaff();
  const { t } = await getI18n();
  return <div className="inicio-altazor-page">
    <h1 className="sr-only">{t("nav.home")}</h1>
    <Suspense fallback={<div className="mx-auto mb-5 h-36 w-full max-w-[880px] animate-pulse motion-reduce:animate-none rounded-xl bg-[var(--mist)]" aria-hidden="true" />}><DayOverview user={user} /></Suspense>
    {canSome(user, "assistant.use") && <AltazorHome showDesktopActivity />}
  </div>;
}
