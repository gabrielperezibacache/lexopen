import { CaseListServer, type CaseListSearchParams } from "@/components/causas/CaseListServer";

export default function CausasPage({ searchParams }: { searchParams: Promise<CaseListSearchParams> }) {
  return <CaseListServer mode="manual" searchParams={searchParams} />;
}
