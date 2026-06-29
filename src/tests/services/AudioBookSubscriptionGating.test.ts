import { SubscriptionGatingMode, SubscriptionTierLevel } from '@prisma/client';
import { AudioBookService } from '../../services/AudioBookService';
import { SubscriptionClient } from '../../clients/SubscriptionClient';
import { HttpStatusCode } from '../../types/common';
import { AuthRole } from '../../constants/authRoles';

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
      minSubscriptionTier: SubscriptionTierLevel | null;
   } | null;
}) {
   return {
      audioBook: {
         findUnique: jest.fn().mockResolvedValue(opts.audiobook ?? null),
      },
   } as any;
}

function buildMockSubscriptionClient(tier: SubscriptionTierLevel | null): SubscriptionClient {
   return {
      getUserHighestActiveTier: jest.fn().mockResolvedValue(tier),
   } as unknown as SubscriptionClient;
}

describe('AudioBookService subscription gating', () => {
   const audiobookId = 'audiobook-1';
   const userId = 'auth-user-uuid';
   const accessToken = 'test-token';

   it('grants access when no minSubscriptionTier in NONE mode (logged-in LISTENER)', async () => {
      const subClient = buildMockSubscriptionClient(null);
      const service = new AudioBookService(buildMockPrisma({}), undefined, subClient);
      await expect(
         service.getSubscriptionAccessForAudiobook(
            audiobookId,
            { subscriptionGatingMode: SubscriptionGatingMode.NONE, minSubscriptionTier: null },
            userId,
            accessToken,
            AuthRole.LISTENER,
         ),
      ).resolves.toEqual({ canAccess: true });
      expect(subClient.getUserHighestActiveTier).not.toHaveBeenCalled();
   });

   it('returns open access in CHAPTER mode for non-gating roles', async () => {
      const service = new AudioBookService(buildMockPrisma({}), undefined, buildMockSubscriptionClient(null));
      await expect(
         service.getSubscriptionAccessForAudiobook(
            audiobookId,
            { subscriptionGatingMode: SubscriptionGatingMode.CHAPTER, minSubscriptionTier: null },
            userId,
            accessToken,
            AuthRole.AUTHOR,
         ),
      ).resolves.toEqual({ canAccess: true });
   });

   it('returns login_required when user is not logged in', async () => {
      const service = new AudioBookService(buildMockPrisma({}), undefined, buildMockSubscriptionClient(null));
      await expect(
         service.getSubscriptionAccessForAudiobook(
            audiobookId,
            { subscriptionGatingMode: SubscriptionGatingMode.AUDIOBOOK, minSubscriptionTier: SubscriptionTierLevel.STANDARD },
            null,
            null,
            AuthRole.LISTENER,
         ),
      ).resolves.toMatchObject({
         canAccess: false,
         message: 'forbidden.login_required',
      });
   });

   it('returns tier_too_low when tier is below required in AUDIOBOOK mode', async () => {
      const service = new AudioBookService(buildMockPrisma({}), undefined, buildMockSubscriptionClient(SubscriptionTierLevel.BASE));
      await expect(
         service.getSubscriptionAccessForAudiobook(
            audiobookId,
            { subscriptionGatingMode: SubscriptionGatingMode.AUDIOBOOK, minSubscriptionTier: SubscriptionTierLevel.STANDARD },
            userId,
            accessToken,
            AuthRole.LISTENER,
         ),
      ).resolves.toMatchObject({
         canAccess: false,
         message: 'forbidden.subscription_tier_too_low',
         userTier: SubscriptionTierLevel.BASE,
      });
   });

   it('grants access when tier qualifies in AUDIOBOOK mode', async () => {
      const service = new AudioBookService(buildMockPrisma({}), undefined, buildMockSubscriptionClient(SubscriptionTierLevel.STANDARD));
      await expect(
         service.getSubscriptionAccessForAudiobook(
            audiobookId,
            { subscriptionGatingMode: SubscriptionGatingMode.AUDIOBOOK, minSubscriptionTier: SubscriptionTierLevel.STANDARD },
            userId,
            accessToken,
            AuthRole.LISTENER,
         ),
      ).resolves.toMatchObject({ canAccess: true, userTier: SubscriptionTierLevel.STANDARD });
   });

   it('assertUserCanAccessBySubscription throws FORBIDDEN when denied in AUDIOBOOK mode', async () => {
      const prisma = buildMockPrisma({
         audiobook: {
            id: audiobookId,
            subscriptionGatingMode: SubscriptionGatingMode.AUDIOBOOK,
            minSubscriptionTier: SubscriptionTierLevel.STANDARD,
         },
      });
      const service = new AudioBookService(prisma, undefined, buildMockSubscriptionClient(SubscriptionTierLevel.BASE));
      await expect(
         service.assertUserCanAccessBySubscription(audiobookId, userId, accessToken, AuthRole.LISTENER),
      ).rejects.toMatchObject({
         statusCode: HttpStatusCode.FORBIDDEN,
      });
   });

   it('assertUserCanAccessBySubscription does not throw for AUTHOR in CHAPTER mode', async () => {
      const prisma = buildMockPrisma({
         audiobook: {
            id: audiobookId,
            subscriptionGatingMode: SubscriptionGatingMode.CHAPTER,
            minSubscriptionTier: null,
         },
      });
      const service = new AudioBookService(prisma, undefined, buildMockSubscriptionClient(null));
      await expect(
         service.assertUserCanAccessBySubscription(audiobookId, userId, accessToken, AuthRole.AUTHOR),
      ).resolves.toBeUndefined();
   });
});
