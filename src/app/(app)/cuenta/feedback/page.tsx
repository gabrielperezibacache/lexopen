import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FeedbackPanel } from "@/components/feedback/FeedbackPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { isStaff } from "@/lib/auth/rbac";
import { requireUser } from "@/lib/auth/session";
import { readFeedback } from "@/lib/feedback/service";
import { getI18n } from "@/lib/i18n/server";

export default async function FeedbackRoute() {
  const user = await requireUser();
  if (!isStaff(user.role)) redirect("/cuenta");
  const [{ locale }, initial] = await Promise.all([getI18n(), readFeedback(user)]);
  return (
    <div className="min-w-0">
      <PageHeader artwork="correspondence" title="Feedback"
        subtitle={locale === "en" ? "Suggest an improvement or report a problem in LexOpen." : "Propón una mejora o avisa si algo falla en LexOpen."}
        actions={<Link className="btn btn-ghost" href="/cuenta"><ArrowLeft size={16} aria-hidden="true" />{locale === "en" ? "My account" : "Mi cuenta"}</Link>}
      />
      <FeedbackPanel key={user.id} initial={initial} locale={locale} />
    </div>
  );
}
