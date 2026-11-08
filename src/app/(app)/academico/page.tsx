import { requireStaff } from "@/lib/auth/session";
import { actorFor } from "@/lib/books/access";
import { AltazorAcademic } from "@/components/altazor/AltazorAcademic";
export const metadata = { title: "Académico · LexOpen" };
const id = (value?: string | string[]) => typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value) ? value : "";
export default async function AcademicPage({ searchParams }: { searchParams: Promise<{ trabajo?: string | string[]; resultado?: string | string[]; vista?: string | string[] }> }) {
  await actorFor(await requireStaff());
  const query = await searchParams;
  const initialWorkspaceId = id(query.trabajo);
  const initialTeaching = !initialWorkspaceId && query.vista === "docencia";
  return <AltazorAcademic key={initialTeaching ? "teaching" : "work"} initialWorkspaceId={initialWorkspaceId} initialArtifactId={id(query.resultado)} initialTeaching={initialTeaching} />;
}
