import { SubscriptionGatingMode } from '@prisma/client';
import { SubscriptionClient, subscriptionClient } from '../clients/SubscriptionClient';
import { SubscriptionAccessDto } from '../models/SubscriptionAccessDto';
import { MessageHandler } from '../utils/MessageHandler';
import { isSubscriptionGatingEnforcedRole } from '../constants/authRoles';

export interface AudiobookGatingContext {
   subscriptionGatingMode: SubscriptionGatingMode;
   minSubscriptionTier: number | null;
}

export interface ChapterGatingContext {
   minSubscriptionTier: number | null;
}

export class SubscriptionAccessService {
   private subscriptionClient: SubscriptionClient;

   constructor(subscriptionClientInstance: SubscriptionClient = subscriptionClient) {
      this.subscriptionClient = subscriptionClientInstance;
   }

   async getUserHighestActiveTier(userId: string, accessToken: string): Promise<number | null> {
      return this.subscriptionClient.getUserHighestActiveTier(userId, accessToken);
   }

   resolveAudiobookRequiredTier(audiobook: AudiobookGatingContext): number | null {
      if (audiobook.subscriptionGatingMode !== SubscriptionGatingMode.AUDIOBOOK) {
         return null;
      }
      return audiobook.minSubscriptionTier ?? null;
   }

   resolveChapterRequiredTier(
      audiobook: AudiobookGatingContext,
      chapter: ChapterGatingContext,
   ): number | null {
      if (audiobook.subscriptionGatingMode === SubscriptionGatingMode.AUDIOBOOK) {
         return audiobook.minSubscriptionTier ?? null;
      }
      if (audiobook.subscriptionGatingMode === SubscriptionGatingMode.CHAPTER) {
         return chapter.minSubscriptionTier ?? null;
      }
      return null;
   }

   async evaluateAccess(
      requiredTier: number | null | undefined,
      userId: string | null,
      accessToken: string | null,
      userRole?: string | null,
   ): Promise<SubscriptionAccessDto> {
      const tier = requiredTier ?? null;
      if (tier === null) {
         return { canAccess: true };
      }

      if (tier === 0) {
         if (!isSubscriptionGatingEnforcedRole(userRole ?? undefined)) {
            return { canAccess: true, requiredTier: 0 };
         }
         if (!userId || !accessToken) {
            return {
               canAccess: false,
               message: MessageHandler.getErrorMessage('forbidden.subscription_required'),
               requiredTier: 0,
               userTier: null,
            };
         }
         return { canAccess: true, requiredTier: 0 };
      }

      if (!isSubscriptionGatingEnforcedRole(userRole ?? undefined)) {
         return { canAccess: true, requiredTier: tier };
      }

      if (!userId || !accessToken) {
         return {
            canAccess: false,
            message: MessageHandler.getErrorMessage('forbidden.subscription_required'),
            requiredTier: tier,
            userTier: null,
         };
      }

      const userTier = await this.getUserHighestActiveTier(userId, accessToken);
      if (userTier === null) {
         return {
            canAccess: false,
            message: MessageHandler.getErrorMessage('forbidden.subscription_required'),
            requiredTier: tier,
            userTier: null,
         };
      }

      if (userTier < tier) {
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
