-- Add transcodingReady and default new chapters to inactive until transcoding completes.
ALTER TABLE "chapters" ADD COLUMN "transcodingReady" BOOLEAN NOT NULL DEFAULT false;

-- Treat existing active chapters as already transcoding-ready.
UPDATE "chapters" SET "transcodingReady" = "isActive";

-- New chapters default to inactive.
ALTER TABLE "chapters" ALTER COLUMN "isActive" SET DEFAULT false;
