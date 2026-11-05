import { CaseWorkspaceServer, type CaseWorkspaceParams } from "@/components/causas/CaseWorkspaceServer";

export default function CausaDetailPage(props: CaseWorkspaceParams) {
  return <CaseWorkspaceServer {...props} mode="manual" />;
}
