import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { bookFor } from "@/lib/books/access";
import { BookReader } from "@/components/books/BookReader";

export const metadata = { title: "Lectura y fuentes · LexOpen" };

export default async function LibraryBookPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff(), { id } = await params;
  try { await bookFor(id, user); }
  catch (error) { if ((error as { status?: number }).status === 404) notFound(); throw error; }
  return <BookReader bookId={id} />;
}
