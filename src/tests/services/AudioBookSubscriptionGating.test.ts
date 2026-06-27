import { SubscriptionGatingMode } from '@prisma/client';
import { AudioBookService } from '../../services/AudioBookService';
import { SubscriptionClient } from '../../clients/SubscriptionClient';
import { HttpStatusCode } from '../../types/common';

jest.mock('../../utils/MessageHandler', () => ({
   MessageHandler: {
      getErrorMessage: (key: string) => key,
      getSuccessMessage: (key: string) => key,
   },
}));

function buildMockPrisma(opts: {
   audiobook?: {
      id: string;
      subscriptionGatingMode: SubscriptionGatingMode;
      minSubscriptionTier: number | null;
   } | null;
}) {
   return {
      audioBook: {
         findUnique: jest.fn().mockResolvedValue(opts.audiobook ?? null),
      },
   } as any;
}

function buildMockSubscriptionClient(tier: number | null): SubscriptionClient {
   return {
      getUserHighestActiveTier: jest.fn().mockResolvedValue(tier),
   } as unknown as SubscriptionClient;
}

describe('AudioBookService subscription gating', () => {
   const audiobookId = 'audiobook-1';
   const userId = 'auth-user-uuid';
   const accessToken = 'test-token';

   it('grants access when no minSubscriptionTier in NONE mode', async () => {
      const subClient = buildMockSubscriptionClient(null);
      const service = new AudioBookService(buildMockPrisma({}), undefined, subClient);
      await expect(
         service.getSubscriptionAccessForAudiobook(
            audiobookId,
            { subscriptionGatingMode: SubscriptionGatingMode.NONE, minSubscriptionTier: null },
            userId,
            accessToken,
         ),
      ).resolves.toEqual({ canAccess: true });
      expect(subClient.getUserHighestActiveTier).not.toHaveBeenCalled();
   });

   it('returns open access in CHAPTER mode regardless of tier', async () => {
      const service = new AudioBookService(buildMockPrisma({}), undefined, buildMockSubscriptionClient(null));
      await expect(
         service.getSubscriptionAccessForAudiobook(
            audiobookId,
            { subscriptionGatingMode: SubscriptionGatingMode.CHAPTER, minSubscriptionTier: null },
            null,
            null,
         ),
      ).resolves.toEqual({ canAccess: true });
   });

   it('returns subscription_required without user or token in AUDIOBOOK mode', async () => {
      const service = new AudioBookService(buildMockPrisma({}), undefined, buildMockSubscriptionClient(null));
      await expect(
         service.getSubscriptionAccessForAudiobook(
            audiobookId,
            { subscriptionGatingMode: SubscriptionGatingMode.AUDIOBOOK, minSubscriptionTier: 2 },
            null,
            null,
         ),
      ).resolves.toMatchObject({
         canAccess: false,
         message: 'forbidden.subscription_required',
      });
   });

   it('returns tier_too_low when tier is below required in AUDIOBOOK mode', async () => {
      const service = new AudioBookService(buildMockPrisma({}), undefined, buildMockSubscriptionClient(1));
      await expect(
         service.getSubscriptionAccessForAudiobook(
            audiobookId,
            { subscriptionGatingMode: SubscriptionGatingMode.AUDIOBOOK, minSubscriptionTier: 2 },
            userId,
            accessToken,
         ),
      ).resolves.toMatchObject({
         canAccess: false,
         message: 'forbidden.subscription_tier_too_low',
         userTier: 1,
      });
   });

   it('grants access when tier qualifies in AUDIOBOOK mode', async () => {
      const service = new AudioBookService(buildMockPrisma({}), undefined, buildMockSubscriptionClient(2));
      await expect(
         service.getSubscriptionAccessForAudiobook(
            audiobookId,
            { subscriptionGatingMode: SubscriptionGatingMode.AUDIOBOOK, minSubscriptionTier: 2 },
            userId,
            accessToken,
         ),
      ).resolves.toMatchObject({ canAccess: true, userTier: 2 });
   });

   it('assertUserCanAccessBySubscription throws FORBIDDEN when denied in AUDIOBOOK mode', async () => {
      const prisma = buildMockPrisma({
         audiobook: {
            id: audiobookId,
            subscriptionGatingMode: SubscriptionGatingMode.AUDIOBOOK,
            minSubscriptionTier: 2,
         },
      });
      const service = new AudioBookService(prisma, undefined, buildMockSubscriptionClient(1));
      await expect(
         service.assertUserCanAccessBySubscription(audiobookId, userId, accessToken),
      ).rejects.toMatchObject({
         statusCode: HttpStatusCode.FORBIDDEN,
      });
   });

   it('assertUserCanAccessBySubscription does not throw in CHAPTER mode', async () => {
      const prisma = buildMockPrisma({
         audiobook: {
            id: audiobookId,
            subscriptionGatingMode: SubscriptionGatingMode.CHAPTER,
            minSubscriptionTier: null,
         },
      });
      const service = new AudioBookService(prisma, undefined, buildMockSubscriptionClient(null));
      await expect(
         service.assertUserCanAccessBySubscription(audiobookId, userId, accessToken),
      ).resolves.toBeUndefined();
   });
});
