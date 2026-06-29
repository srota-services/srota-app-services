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

/** All valid SubscriptionTierLevel values. */
export const ALL_TIER_LEVELS = Object.values(SubscriptionTierLevel) as SubscriptionTierLevel[];

/** Numeric string aliases accepted from form inputs ("1" → BASE, etc.). */
export const TIER_NUMERIC_ALIAS: Record<string, SubscriptionTierLevel> = {
   '1': SubscriptionTierLevel.BASE,
   '2': SubscriptionTierLevel.STANDARD,
   '3': SubscriptionTierLevel.PREMIUM,
};
