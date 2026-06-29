import { SubscriptionTierLevel } from '@prisma/client';

export { SubscriptionTierLevel };

/**
 * Numeric ordering for SubscriptionTierLevel comparisons.
 * Higher number = higher tier.
 */
export const SUBSCRIPTION_TIER_ORDER: Record<SubscriptionTierLevel, number> = {
   [SubscriptionTierLevel.BASE]: 1,
   [SubscriptionTierLevel.STANDARD]: 2,
   [SubscriptionTierLevel.PREMIUM]: 3,
};

/** Order value for free / no subscription (null tier). */
export const FREE_TIER_ORDER = 0;

/** Maximum tier step-ups allowed across an audiobook's chapter sequence. */
export const MAX_CHAPTER_TIER_INCREASES = 2;

/** All valid SubscriptionTierLevel values. */
export const ALL_TIER_LEVELS = Object.values(SubscriptionTierLevel) as SubscriptionTierLevel[];

/** Numeric string aliases accepted from form inputs ("1" → BASE, etc.). */
export const TIER_NUMERIC_ALIAS: Record<string, SubscriptionTierLevel> = {
   '1': SubscriptionTierLevel.BASE,
   '2': SubscriptionTierLevel.STANDARD,
   '3': SubscriptionTierLevel.PREMIUM,
};

export interface ChapterTierRow {
   id?: string;
   chapterNumber: number;
   minSubscriptionTier: SubscriptionTierLevel | null;
}

/** Map a tier (or null for free) to its numeric order. */
export function tierToOrder(tier: SubscriptionTierLevel | null): number {
   if (tier === null) {
      return FREE_TIER_ORDER;
   }
   return SUBSCRIPTION_TIER_ORDER[tier];
}

/** Sort chapters by chapterNumber ascending. */
export function sortChaptersByNumber(chapters: ChapterTierRow[]): ChapterTierRow[] {
   return [...chapters].sort((a, b) => a.chapterNumber - b.chapterNumber);
}

/** True when tier orders are non-decreasing by chapterNumber. */
export function isNonDecreasingSequence(chapters: ChapterTierRow[]): boolean {
   const sorted = sortChaptersByNumber(chapters);
   for (let i = 1; i < sorted.length; i++) {
      if (tierToOrder(sorted[i]!.minSubscriptionTier) < tierToOrder(sorted[i - 1]!.minSubscriptionTier)) {
         return false;
      }
   }
   return true;
}

/** Count adjacent pairs where tier strictly increases. */
export function countTierStepUps(chapters: ChapterTierRow[]): number {
   const sorted = sortChaptersByNumber(chapters);
   let count = 0;
   for (let i = 1; i < sorted.length; i++) {
      if (tierToOrder(sorted[i]!.minSubscriptionTier) > tierToOrder(sorted[i - 1]!.minSubscriptionTier)) {
         count++;
      }
   }
   return count;
}

/** Return the highest non-null chapter tier, or null if none. */
export function maxTierLevelFromChapters(
   chapters: { minSubscriptionTier: SubscriptionTierLevel | null }[],
): SubscriptionTierLevel | null {
   let maxOrder = -1;
   let maxTier: SubscriptionTierLevel | null = null;
   for (const ch of chapters) {
      if (ch.minSubscriptionTier === null) {
         continue;
      }
      const order = tierToOrder(ch.minSubscriptionTier);
      if (order > maxOrder) {
         maxOrder = order;
         maxTier = ch.minSubscriptionTier;
      }
   }
   return maxTier;
}
