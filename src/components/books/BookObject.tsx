import { BookOpen, Flower2 } from "lucide-react";
import type { CSSProperties } from "react";
import type { BookSummary } from "@/lib/books/types";

export function BookObject({ book, preview = false }: { book: Pick<BookSummary, "title" | "author" | "year" | "coverColor" | "coverStyle" | "spineLabel"> & Partial<Pick<BookSummary, "sourceType" | "judicial">>; preview?: boolean }) {
  const words = book.title.trim().split(/\s+/);
  const longestWord = Math.max(1, ...words.map(word => Array.from(word).length));
  const coverWords: string[] = [];
  for (const word of words) { if (coverWords.length && (coverWords.length === 7 || [...coverWords, word].join(" ").length > 80)) break; coverWords.push(word); }
  const shortened = coverWords.length < words.length;
  const coverTitleSize = Math.max(10, Math.min(18.72, 181 / (longestWord + 1)));
  return <span className="law-book-scene" aria-hidden="true" data-preview={preview || undefined}>
    <span className="law-book-volume" data-color={book.coverColor} data-material={book.coverStyle} data-title-density={book.title.length > 55 || coverWords.length > 5 ? "compact" : undefined} style={{ "--cover-title-size": `${coverTitleSize}px` } as CSSProperties}>
      <span className="law-book-pages" /><span className="law-book-spine"><span>{book.spineLabel || book.title}</span></span>
      <span className="law-book-front"><span className="law-book-frame" /><span className="law-book-author">{book.judicial?.court || book.author || (preview ? "Tu biblioteca personal" : "Autor no indicado")}</span><span className="law-book-title" title={book.title}>{coverWords.map((word, index) => <span className="law-book-title-word" key={index}>{word}{shortened && index === coverWords.length - 1 ? "…" : ""}</span>)}</span><span className="law-book-spine-title">{book.spineLabel || book.title}</span><span className="law-book-ornament"><span /><Flower2 size={17} strokeWidth={1.2} /><span /></span><span className="law-book-imprint">{book.judicial?.caseNumber || book.year || (preview ? "Ex libris" : "Edición personal")}</span><BookOpen className="law-book-press" size={19} strokeWidth={1.2} /></span>
    </span>
  </span>;
}
