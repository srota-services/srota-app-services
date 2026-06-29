import { SubscriptionTierLevel } from '@prisma/client';

export { SubscriptionTierLevel };

/** Subscription playback access for audiobooks and chapters. */
export interface SubscriptionAccessDto {
   canAccess: boolean;
   /** Human-readable reason when `canAccess` is false; omitted when access is granted. */
   message?: string;
   requiredTier?: SubscriptionTierLevel;
   userTier?: SubscriptionTierLevel | null;
}

/** @deprecated Use SubscriptionAccessDto */
export type AudiobookSubscriptionAccessDto = SubscriptionAccessDto;
