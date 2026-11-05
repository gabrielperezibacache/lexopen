import { CaseListServer, type CaseListSearchParams } from "@/components/causas/CaseListServer";

export default function PjudPage({ searchParams }: { searchParams: Promise<CaseListSearchParams> }) {
  return <CaseListServer mode="pjud_cl" searchParams={searchParams} />;
}
