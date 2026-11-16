CREATE TABLE "LibraryReadingNote" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "bookId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "notes" TEXT NOT NULL,
  "bookmarkKind" TEXT NOT NULL DEFAULT '',
  "bookmarkNumber" TEXT NOT NULL DEFAULT '',
  "bookRevision" INTEGER NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LibraryReadingNote_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LibraryReadingNote_ownerId_bookId_key" ON "LibraryReadingNote"("ownerId", "bookId");
CREATE INDEX "LibraryReadingNote_bookId_idx" ON "LibraryReadingNote"("bookId");
ALTER TABLE "LibraryReadingNote" ADD CONSTRAINT "LibraryReadingNote_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LibraryReadingNote" ADD CONSTRAINT "LibraryReadingNote_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "LibraryBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
