import { CaseListServer, type CaseListSearchParams } from "@/components/causas/CaseListServer";

export default function MyMattersPage({ searchParams }: { searchParams: Promise<CaseListSearchParams> }) {
  return <CaseListServer mode="manual" organizer searchParams={searchParams} />;
}
