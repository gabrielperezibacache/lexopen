import { requireStaff } from "@/lib/auth/session";
import { actorFor } from "@/lib/books/access";
import { Bookshelf } from "@/components/books/Bookshelf";

export const metadata = { title: "Mi biblioteca jurídica · LexOpen" };

export default async function LibraryPage() {
  const user = await actorFor(await requireStaff());
  return <Bookshelf userName={user.name} />;
}
