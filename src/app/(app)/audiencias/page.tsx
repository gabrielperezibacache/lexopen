import { requireStaff } from "@/lib/auth/session";
import { actorFor } from "@/lib/books/access";
import { AudienceHub } from "@/components/hearings/AudienceHub";

export const metadata = { title: "Panel de audiencias · LexOpen" };

export default async function AudiencesPage() {
  const user = await actorFor(await requireStaff());
  return <AudienceHub userName={user.name} />;
}
