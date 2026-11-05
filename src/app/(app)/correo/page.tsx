import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/sites/SiteNav";
import { MailboxPanel } from "@/components/mail/MailboxPanel";
import { requireStaff } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { MAIL_SETTINGS_PATH, mailSettingsResult, type MailSettingsQuery } from "@/lib/mail/settings-location";

export default async function CorreoPage({ searchParams }: { searchParams: Promise<MailSettingsQuery> }) {
  await requireStaff();
  const result = mailSettingsResult(await searchParams);
  if (result) redirect(`${MAIL_SETTINGS_PATH}?${new URLSearchParams({ [result.provider]: result.status })}`);
  const { t } = await getI18n();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("mailbox.eyebrow")}
        title={t("mailbox.title")}
        subtitle={t("mailbox.subtitle")}
        actions={<Link className="btn btn-secondary" href={MAIL_SETTINGS_PATH}>{t("mailbox.openSettings")}</Link>}
      />
      <Suspense fallback={<div className="panel rounded-[var(--radius-lg)] p-6">{t("common.loading")}</div>}>
        <MailboxPanel />
      </Suspense>
    </div>
  );
}
