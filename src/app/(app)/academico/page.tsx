import { requireStaff } from "@/lib/auth/session";
import { actorFor } from "@/lib/books/access";
import { AltazorAcademic } from "@/components/altazor/AltazorAcademic";
import { academicHref, academicLocation } from "@/lib/altazor/academic-templates";
export const metadata = { title: "Académico · LexOpen" };
export default async function AcademicPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await actorFor(await requireStaff());
  const location = academicLocation(await searchParams);
  return <AltazorAcademic key={academicHref(location.workspaceId, location.artifactId, location.pane, location.step)} initialLocation={location} />;
}
