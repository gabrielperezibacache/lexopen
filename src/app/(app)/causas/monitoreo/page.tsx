import PjudPortfolioWorkspace from "@/components/pjud/PjudPortfolioWorkspace";
import { PjudManagementNotice } from "@/components/causas/PjudManagementNotice";
import { getCaseManagementMode } from "@/lib/causas/management-mode";
import { requireStaff } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/rbac";

export default async function Page() {
  const user = await requireStaff();
  if (await getCaseManagementMode() !== "pjud_cl") return <PjudManagementNotice canConfigure={isAdmin(user)} />;
  return <PjudPortfolioWorkspace />;
}
