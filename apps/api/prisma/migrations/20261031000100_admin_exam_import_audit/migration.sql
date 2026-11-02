ALTER TABLE "Question"
  ADD COLUMN "sourcePage" INTEGER,
  ADD COLUMN "sourceDocumentHash" TEXT,
  ADD COLUMN "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "ExamImportBatch" (
  "id" TEXT NOT NULL,
  "previewId" TEXT NOT NULL,
  "examId" TEXT,
  "status" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "day" INTEGER NOT NULL,
  "color" TEXT NOT NULL,
  "language" TEXT,
  "version" TEXT NOT NULL,
  "report" JSONB NOT NULL,
  "approvedAt" TIMESTAMP(3) NOT NULL,
  "persistedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExamImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExamImportSource" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "origin" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "storagePath" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "pageCount" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExamImportSource_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExamImportBatch_previewId_key" ON "ExamImportBatch"("previewId");
CREATE INDEX "ExamImportBatch_examId_createdAt_idx" ON "ExamImportBatch"("examId", "createdAt");
CREATE INDEX "ExamImportBatch_year_day_color_language_version_idx" ON "ExamImportBatch"("year", "day", "color", "language", "version");
CREATE UNIQUE INDEX "ExamImportSource_batchId_role_key" ON "ExamImportSource"("batchId", "role");
CREATE INDEX "ExamImportSource_sha256_idx" ON "ExamImportSource"("sha256");

ALTER TABLE "ExamImportBatch"
  ADD CONSTRAINT "ExamImportBatch_examId_fkey"
  FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ExamImportSource"
  ADD CONSTRAINT "ExamImportSource_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "ExamImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
