import { SubscriptionGatingMode, SubscriptionTierLevel } from '@prisma/client';
import { SubscriptionClient, subscriptionClient } from '../clients/SubscriptionClient';
import { SubscriptionAccessDto } from '../models/SubscriptionAccessDto';
import { MessageHandler } from '../utils/MessageHandler';
import { isSubscriptionGatingEnforcedRole, isGuestRole } from '../constants/authRoles';
import { SUBSCRIPTION_TIER_ORDER } from '../constants/subscriptionTierLevel';

export interface AudiobookGatingContext {
   subscriptionGatingMode: SubscriptionGatingMode;
   minSubscriptionTier: SubscriptionTierLevel | null;
}

export interface ChapterGatingContext {
   minSubscriptionTier: SubscriptionTierLevel | null;
}

export class SubscriptionAccessService {
   private subscriptionClient: SubscriptionClient;

   constructor(subscriptionClientInstance: SubscriptionClient = subscriptionClient) {
      this.subscriptionClient = subscriptionClientInstance;
   }

   async getUserHighestActiveTier(userId: string, accessToken: string): Promise<SubscriptionTierLevel | null> {
      return this.subscriptionClient.getUserHighestActiveTier(userId, accessToken);
   }

   resolveAudiobookRequiredTier(audiobook: AudiobookGatingContext): SubscriptionTierLevel | null {
      if (audiobook.subscriptionGatingMode !== SubscriptionGatingMode.AUDIOBOOK) {
         return null;
      }
      return audiobook.minSubscriptionTier ?? null;
   }

   resolveChapterRequiredTier(
      audiobook: AudiobookGatingContext,
      chapter: ChapterGatingContext,
   ): SubscriptionTierLevel | null {
      if (audiobook.subscriptionGatingMode === SubscriptionGatingMode.AUDIOBOOK) {
         return audiobook.minSubscriptionTier ?? null;
      }
      if (audiobook.subscriptionGatingMode === SubscriptionGatingMode.CHAPTER) {
         return chapter.minSubscriptionTier ?? null;
      }
      return null;
   }

   async evaluateAccess(
      requiredTier: SubscriptionTierLevel | null | undefined,
      userId: string | null,
      accessToken: string | null,
      userRole?: string | null,
   ): Promise<SubscriptionAccessDto> {
      const tier = requiredTier ?? null;

      // Gate 1: all content requires a registered login — GUEST and unauthenticated users are denied.
      if (!userId || !accessToken || isGuestRole(userRole ?? undefined)) {
         return {
            canAccess: false,
            message: MessageHandler.getErrorMessage('forbidden.login_required'),
            ...(tier !== null ? { requiredTier: tier } : {}),
            userTier: null,
         };
      }

      // Gate 2: non-gating roles (AUTHOR, ADMIN, ORG) bypass subscription checks entirely.
      if (!isSubscriptionGatingEnforcedRole(userRole ?? undefined)) {
         return { canAccess: true, ...(tier !== null ? { requiredTier: tier } : {}) };
      }

      // Gate 3: no tier required (NONE mode) — logged-in LISTENER passes without a subscription.
      if (tier === null) {
         return { canAccess: true };
      }

      // Gate 4: subscription tier comparison.
      const userTier = await this.getUserHighestActiveTier(userId, accessToken);
      if (userTier === null) {
         return {
            canAccess: false,
            message: MessageHandler.getErrorMessage('forbidden.subscription_required'),
            requiredTier: tier,
            userTier: null,
         };
      }

      if (SUBSCRIPTION_TIER_ORDER[userTier]! < SUBSCRIPTION_TIER_ORDER[tier]!) {
         return {
            canAccess: false,
            message: MessageHandler.getErrorMessage('forbidden.subscription_tier_too_low'),
            requiredTier: tier,
            userTier,
         };
      }

      return { canAccess: true, requiredTier: tier, userTier };
   }

   /** Chapter-mode audiobook detail is always open; gating is per chapter. */
   openAccess(): SubscriptionAccessDto {
      return { canAccess: true };
   }
}

export const subscriptionAccessService = new SubscriptionAccessService();
