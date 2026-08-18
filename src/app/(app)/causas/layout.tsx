import { CausasSectionTabs } from "@/components/causas/CausasSectionTabs";
import { requireStaff } from "@/lib/auth/session";

export default async function CausasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireStaff();
  return (
    <div className="space-y-6">
      <CausasSectionTabs canOperateClaveUnica={user.role !== "asistente"} />
      {children}
    </div>
  );
}
