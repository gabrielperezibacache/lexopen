import { NextResponse } from "next/server";
import { handleRouteError, requireStaff } from "@/lib/api";
import { actorFor } from "@/lib/books/access";
import { listBooks, readBook } from "@/lib/books/service";
import { workbenchSourceCatalog } from "@/lib/workbench/sources";
import { memoryId, type MemorySupportInput } from "@/lib/altazor/memory-types";
export async function GET(request: Request) {
  try {
    const actor = await actorFor(await requireStaff()), sp = new URL(request.url).searchParams, causaId = sp.get("causaId") || null;
    if (causaId) memoryId.parse(causaId);
    if (sp.get("kind") === "evidence") {
      if (!causaId) return NextResponse.json({ error: "Selecciona una causa para utilizar sus documentos" }, { status: 400 });
      const result = await workbenchSourceCatalog(causaId, actor, sp.get("after") || undefined);
      return NextResponse.json({ books: [], sources: result.sources.map(source => ({ label: source.title, quote: source.quote, input: { kind: "evidence", sourceKind: "document", fragmentId: source.fragmentId, versionId: source.versionId, quote: source.quote } satisfies MemorySupportInput })), nextAfter: result.nextAfter, notice: result.coverage }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const books = await listBooks(actor), bookId = sp.get("bookId");
    if (!bookId) return NextResponse.json({ books: books.books.map(book => ({ id: book.id, title: book.title })), sources: [], nextAfter: null, notice: "Elige un libro y después un pasaje. También puedes consultar el catálogo de tu biblioteca." }, { headers: { "Cache-Control": "private, no-store" } });
    const result = await readBook(memoryId.parse(bookId), actor, { after: Number(sp.get("after") || 0) });
    return NextResponse.json({ books: books.books.map(book => ({ id: book.id, title: book.title })), sources: result.fragments.map(fragment => { const quote = fragment.text.slice(0, 3000); return { label: fragment.locatorLabel, quote, input: { kind: "book", bookId, fragmentId: fragment.id, quote } satisfies MemorySupportInput }; }), nextAfter: result.nextAfter, notice: "Pasajes de esta ventana, abreviados a 3.000 caracteres; se cotejarán antes de guardarlos." }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return handleRouteError(error); }
}
