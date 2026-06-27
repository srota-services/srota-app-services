-- CreateEnum
CREATE TYPE "SubscriptionGatingMode" AS ENUM ('NONE', 'AUDIOBOOK', 'CHAPTER');

-- AlterTable
ALTER TABLE "audiobooks" ADD COLUMN "subscriptionGatingMode" "SubscriptionGatingMode" NOT NULL DEFAULT 'NONE';

-- Backfill: existing tier-gated audiobooks use AUDIOBOOK mode
UPDATE "audiobooks"
SET "subscriptionGatingMode" = 'AUDIOBOOK'
WHERE "minSubscriptionTier" IS NOT NULL;

-- AlterTable
ALTER TABLE "chapters" ADD COLUMN "minSubscriptionTier" INTEGER;
