-- Keep legacy `transcription` and `transcriptionResult` readable while making
-- the faithful/normalized transcription fields queryable and explicit.
ALTER TABLE "Essay"
  ADD COLUMN "rawTranscription" TEXT,
  ADD COLUMN "normalizedTranscription" TEXT,
  ADD COLUMN "transcriptionParagraphs" JSONB,
  ADD COLUMN "transcriptionCorrections" JSONB,
  ADD COLUMN "transcriptionUncertainTerms" JSONB,
  ADD COLUMN "transcriptionConfidence" DOUBLE PRECISION,
  ADD COLUMN "transcriptionRequiresReview" BOOLEAN;
