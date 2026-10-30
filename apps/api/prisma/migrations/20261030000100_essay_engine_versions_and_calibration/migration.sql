ALTER TABLE "EssayEvaluation"
  ADD COLUMN "model" TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN "rubricVersion" TEXT NOT NULL DEFAULT 'enem-2026-simulation-v3',
  ADD COLUMN "confidence" TEXT NOT NULL DEFAULT 'media',
  ADD COLUMN "needsHumanReview" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "EssayEvaluation_createdAt_idx" ON "EssayEvaluation"("createdAt");
CREATE INDEX "EssayEvaluation_rubricVersion_model_idx" ON "EssayEvaluation"("rubricVersion", "model");

CREATE TABLE "EssayReference" (
  "id" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "year" INTEGER,
  "source" TEXT NOT NULL,
  "sourceUrl" TEXT,
  "license" TEXT NOT NULL,
  "authorizationConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "reviewStatus" TEXT NOT NULL DEFAULT 'pending',
  "competencyAnnotations" JSONB,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "authorizedExcerpt" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EssayReference_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EssayReference_reviewStatus_createdAt_idx" ON "EssayReference"("reviewStatus", "createdAt");
CREATE INDEX "EssayReference_year_idx" ON "EssayReference"("year");

CREATE TABLE "HumanEssayReview" (
  "id" TEXT NOT NULL,
  "evaluationId" TEXT NOT NULL,
  "evaluatorUserId" TEXT NOT NULL,
  "competencyScores" JSONB NOT NULL,
  "totalScore" INTEGER NOT NULL,
  "divergenceReason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "rubricVersion" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HumanEssayReview_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HumanEssayReview_evaluationId_createdAt_idx" ON "HumanEssayReview"("evaluationId", "createdAt");
CREATE INDEX "HumanEssayReview_evaluatorUserId_createdAt_idx" ON "HumanEssayReview"("evaluatorUserId", "createdAt");
CREATE INDEX "HumanEssayReview_status_idx" ON "HumanEssayReview"("status");
ALTER TABLE "HumanEssayReview" ADD CONSTRAINT "HumanEssayReview_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "EssayEvaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HumanEssayReview" ADD CONSTRAINT "HumanEssayReview_evaluatorUserId_fkey" FOREIGN KEY ("evaluatorUserId") REFERENCES "UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
