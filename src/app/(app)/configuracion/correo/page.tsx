import Link from "next/link";
import { Inbox } from "lucide-react";
import { MailboxSettingsPanel } from "@/components/mail/MailboxSettingsPanel";
import { ModuleHeader } from "@/components/ui/PageHeader";
import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getI18n } from "@/lib/i18n/server";
import { mailSettingsResult, type MailSettingsQuery } from "@/lib/mail/settings-location";
import { publicMailboxAccount } from "@/lib/mail/types";

export default async function CorreoSettingsPage({ searchParams }: { searchParams: Promise<MailSettingsQuery> }) {
  const user = await requireStaff();
  const [{ t }, account, query] = await Promise.all([
    getI18n(),
    prisma.mailboxAccount.findUnique({ where: { userId: user.id } }),
    searchParams,
  ]);
  const result = mailSettingsResult(query);

  return (
    <div className="space-y-6">
      <ModuleHeader
        title={t("mailbox.settingsTitle")}
        actions={<Link className="btn btn-secondary" href="/correo"><Inbox size={16} aria-hidden="true" /> {t("mailbox.openInbox")}</Link>}
      />
      <MailboxSettingsPanel key={`${user.id}:${result?.provider ?? ""}:${result?.status ?? ""}`} initialAccount={publicMailboxAccount(account)} oauthStatus={result?.status ?? null} />
    </div>
  );
}
