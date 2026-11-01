-- CreateTable
CREATE TABLE "LibraryBook" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL DEFAULT '',
    "year" TEXT NOT NULL DEFAULT '',
    "edition" TEXT NOT NULL DEFAULT '',
    "publisher" TEXT NOT NULL DEFAULT '',
    "identifier" TEXT NOT NULL DEFAULT '',
    "coverColor" TEXT NOT NULL DEFAULT 'oxblood',
    "coverStyle" TEXT NOT NULL DEFAULT 'leather',
    "spineLabel" TEXT NOT NULL DEFAULT '',
    "shelf" TEXT NOT NULL DEFAULT 'General',
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "sourceName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sourceSha256" TEXT NOT NULL,
    "textSha256" TEXT NOT NULL,
    "extractedText" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "pageCount" INTEGER,
    "locatorKind" TEXT NOT NULL DEFAULT 'text-offset',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryBook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryBookFragment" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "textSha256" TEXT NOT NULL,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "pageNumber" INTEGER,
    "pageStartOffset" INTEGER,
    "pageEndOffset" INTEGER,
    "locatorLabel" TEXT NOT NULL,

    CONSTRAINT "LibraryBookFragment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryBookPage" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "textSha256" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "LibraryBookPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookShelfCollection" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookShelfCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookShelfItem" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookShelfItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookShelfMember" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookShelfMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBookPreference" (
    "userId" TEXT NOT NULL,
    "libraryName" TEXT NOT NULL DEFAULT 'Mi biblioteca jurídica',
    "shelfTheme" TEXT NOT NULL DEFAULT 'walnut',
    "view" TEXT NOT NULL DEFAULT 'covers',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserBookPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "LibraryWritingDraft" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "citationsJson" TEXT NOT NULL,
    "scopeJson" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryWritingDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LibraryBook_ownerId_deletedAt_createdAt_idx" ON "LibraryBook"("ownerId", "deletedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryBook_ownerId_requestId_key" ON "LibraryBook"("ownerId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryBookFragment_bookId_ordinal_key" ON "LibraryBookFragment"("bookId", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryBookPage_bookId_pageNumber_key" ON "LibraryBookPage"("bookId", "pageNumber");

-- CreateIndex
CREATE INDEX "BookShelfCollection_ownerId_createdAt_idx" ON "BookShelfCollection"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "BookShelfItem_bookId_idx" ON "BookShelfItem"("bookId");

-- CreateIndex
CREATE UNIQUE INDEX "BookShelfItem_collectionId_bookId_key" ON "BookShelfItem"("collectionId", "bookId");

-- CreateIndex
CREATE INDEX "BookShelfMember_userId_idx" ON "BookShelfMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BookShelfMember_collectionId_userId_key" ON "BookShelfMember"("collectionId", "userId");

-- CreateIndex
CREATE INDEX "LibraryWritingDraft_ownerId_updatedAt_idx" ON "LibraryWritingDraft"("ownerId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryWritingDraft_ownerId_requestId_key" ON "LibraryWritingDraft"("ownerId", "requestId");

-- AddForeignKey
ALTER TABLE "LibraryBook" ADD CONSTRAINT "LibraryBook_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryBookFragment" ADD CONSTRAINT "LibraryBookFragment_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "LibraryBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryBookPage" ADD CONSTRAINT "LibraryBookPage_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "LibraryBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookShelfCollection" ADD CONSTRAINT "BookShelfCollection_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookShelfItem" ADD CONSTRAINT "BookShelfItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "BookShelfCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookShelfItem" ADD CONSTRAINT "BookShelfItem_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "LibraryBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookShelfMember" ADD CONSTRAINT "BookShelfMember_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "BookShelfCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookShelfMember" ADD CONSTRAINT "BookShelfMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBookPreference" ADD CONSTRAINT "UserBookPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryWritingDraft" ADD CONSTRAINT "LibraryWritingDraft_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

