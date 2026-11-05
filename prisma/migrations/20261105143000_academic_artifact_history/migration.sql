CREATE TABLE "AltazorAcademicArtifactVersion" (
    "id" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "bodySha256" TEXT NOT NULL,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AltazorAcademicArtifactVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AltazorAcademicArtifactVersion_artifactId_revision_key" ON "AltazorAcademicArtifactVersion"("artifactId", "revision");
CREATE INDEX "AltazorAcademicArtifactVersion_artifactId_createdAt_idx" ON "AltazorAcademicArtifactVersion"("artifactId", "createdAt");
ALTER TABLE "AltazorAcademicArtifactVersion" ADD CONSTRAINT "AltazorAcademicArtifactVersion_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "AltazorAcademicArtifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
