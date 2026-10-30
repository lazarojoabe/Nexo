CREATE TABLE "QuestionAsset" (
  "id" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "storagePath" TEXT,
  "placement" TEXT NOT NULL,
  "optionLabel" TEXT,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "mimeType" TEXT NOT NULL,
  "altText" TEXT NOT NULL,
  "sourcePage" INTEGER,
  "sourceCrop" JSONB,
  "sourceHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuestionAsset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QuestionAsset_questionId_placement_optionLabel_displayOrder_idx"
  ON "QuestionAsset"("questionId", "placement", "optionLabel", "displayOrder");

ALTER TABLE "QuestionAsset"
  ADD CONSTRAINT "QuestionAsset_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
