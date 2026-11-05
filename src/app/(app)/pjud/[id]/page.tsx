import { CaseWorkspaceServer, type CaseWorkspaceParams } from "@/components/causas/CaseWorkspaceServer";

export default function PjudDetailPage(props: CaseWorkspaceParams) {
  return <CaseWorkspaceServer {...props} mode="pjud_cl" />;
}
