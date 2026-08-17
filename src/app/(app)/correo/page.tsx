import { Suspense } from "react";
import { PageHeader } from "@/components/sites/SiteNav";
import { MailboxPanel } from "@/components/mail/MailboxPanel";
import { requireStaff } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";

export default async function CorreoPage() {
  await requireStaff();
  const { t } = await getI18n();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("mailbox.eyebrow")}
        title={t("mailbox.title")}
        subtitle={t("mailbox.subtitle")}
      />
      <Suspense fallback={<div className="panel rounded-3xl p-6">{t("common.loading")}</div>}>
        <MailboxPanel />
      </Suspense>
    </div>
  );
}
