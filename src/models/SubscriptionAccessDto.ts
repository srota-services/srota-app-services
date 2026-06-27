/** Subscription playback access for audiobooks and chapters. */
export interface SubscriptionAccessDto {
   canAccess: boolean;
   /** Human-readable reason when `canAccess` is false; omitted when access is granted. */
   message?: string;
   requiredTier?: number;
   userTier?: number | null;
}

/** @deprecated Use SubscriptionAccessDto */
export type AudiobookSubscriptionAccessDto = SubscriptionAccessDto;
