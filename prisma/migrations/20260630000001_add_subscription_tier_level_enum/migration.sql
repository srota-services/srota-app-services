-- CreateEnum
CREATE TYPE "SubscriptionTierLevel" AS ENUM ('BASE', 'STANDARD', 'PREMIUM');

-- AlterTable: convert existing nullable Int minSubscriptionTier on audiobooks to enum
-- Null values (NONE/CHAPTER mode) remain null. Any stale 0-rows map to null (open access).
ALTER TABLE "audiobooks"
  ALTER COLUMN "minSubscriptionTier" TYPE "SubscriptionTierLevel"
  USING CASE
    WHEN "minSubscriptionTier" = 1 THEN 'BASE'::"SubscriptionTierLevel"
    WHEN "minSubscriptionTier" = 2 THEN 'STANDARD'::"SubscriptionTierLevel"
    WHEN "minSubscriptionTier" = 3 THEN 'PREMIUM'::"SubscriptionTierLevel"
    ELSE NULL
  END;

-- AlterTable: same for chapters
ALTER TABLE "chapters"
  ALTER COLUMN "minSubscriptionTier" TYPE "SubscriptionTierLevel"
  USING CASE
    WHEN "minSubscriptionTier" = 1 THEN 'BASE'::"SubscriptionTierLevel"
    WHEN "minSubscriptionTier" = 2 THEN 'STANDARD'::"SubscriptionTierLevel"
    WHEN "minSubscriptionTier" = 3 THEN 'PREMIUM'::"SubscriptionTierLevel"
    ELSE NULL
  END;
