import { SubscriptionGatingMode, SubscriptionTierLevel } from '@prisma/client';
import { SubscriptionAccessService } from '../../services/SubscriptionAccessService';
import { AuthRole } from '../../constants/authRoles';

jest.mock('../../utils/MessageHandler', () => ({
   MessageHandler: {
      getErrorMessage: (key: string) => key,
   },
}));

function buildMockSubscriptionClient(tier: SubscriptionTierLevel | null) {
   return {
      getUserHighestActiveTier: jest.fn().mockResolvedValue(tier),
   } as any;
}

describe('SubscriptionAccessService', () => {
   const userId = 'user-1';
   const accessToken = 'token';

   it('resolveAudiobookRequiredTier returns tier only in AUDIOBOOK mode', () => {
      const service = new SubscriptionAccessService(buildMockSubscriptionClient(null));

      expect(
         service.resolveAudiobookRequiredTier({
            subscriptionGatingMode: SubscriptionGatingMode.AUDIOBOOK,
            minSubscriptionTier: SubscriptionTierLevel.STANDARD,
         }),
      ).toBe(SubscriptionTierLevel.STANDARD);

      expect(
         service.resolveAudiobookRequiredTier({
            subscriptionGatingMode: SubscriptionGatingMode.CHAPTER,
            minSubscriptionTier: null,
         }),
      ).toBeNull();
   });

   it('resolveChapterRequiredTier uses audiobook tier in AUDIOBOOK mode', () => {
      const service = new SubscriptionAccessService(buildMockSubscriptionClient(null));

      expect(
         service.resolveChapterRequiredTier(
            {
               subscriptionGatingMode: SubscriptionGatingMode.AUDIOBOOK,
               minSubscriptionTier: SubscriptionTierLevel.STANDARD,
            },
            { minSubscriptionTier: null },
         ),
      ).toBe(SubscriptionTierLevel.STANDARD);
   });

   it('resolveChapterRequiredTier uses chapter tier in CHAPTER mode', () => {
      const service = new SubscriptionAccessService(buildMockSubscriptionClient(null));

      expect(
         service.resolveChapterRequiredTier(
            {
               subscriptionGatingMode: SubscriptionGatingMode.CHAPTER,
               minSubscriptionTier: null,
            },
            { minSubscriptionTier: SubscriptionTierLevel.PREMIUM },
         ),
      ).toBe(SubscriptionTierLevel.PREMIUM);
   });

   it('evaluateAccess grants access when tier qualifies', async () => {
      const service = new SubscriptionAccessService(buildMockSubscriptionClient(SubscriptionTierLevel.STANDARD));
      await expect(
         service.evaluateAccess(SubscriptionTierLevel.STANDARD, userId, accessToken, AuthRole.LISTENER),
      ).resolves.toMatchObject({
         canAccess: true,
         userTier: SubscriptionTierLevel.STANDARD,
      });
   });

   it('evaluateAccess uses chapter message when tier is too low for chapter content', async () => {
      const service = new SubscriptionAccessService(buildMockSubscriptionClient(SubscriptionTierLevel.BASE));
      await expect(
         service.evaluateAccess(
            SubscriptionTierLevel.STANDARD,
            userId,
            accessToken,
            AuthRole.LISTENER,
            'chapter',
         ),
      ).resolves.toMatchObject({
         canAccess: false,
         message: 'forbidden.subscription_tier_too_low_chapter',
      });
   });

   it('evaluateAccess uses audiobook message when tier is too low for audiobook content', async () => {
      const service = new SubscriptionAccessService(buildMockSubscriptionClient(SubscriptionTierLevel.BASE));
      await expect(
         service.evaluateAccess(
            SubscriptionTierLevel.STANDARD,
            userId,
            accessToken,
            AuthRole.LISTENER,
            'audiobook',
         ),
      ).resolves.toMatchObject({
         canAccess: false,
         message: 'forbidden.subscription_tier_too_low',
      });
   });

   it('evaluateAccess grants access for LISTENER when no tier required (NONE mode)', async () => {
      const client = buildMockSubscriptionClient(null);
      const service = new SubscriptionAccessService(client);
      await expect(
         service.evaluateAccess(null, userId, accessToken, AuthRole.LISTENER),
      ).resolves.toMatchObject({
         canAccess: true,
      });
      expect(client.getUserHighestActiveTier).not.toHaveBeenCalled();
   });

   it('evaluateAccess denies access when user is not logged in (login gate)', async () => {
      const client = buildMockSubscriptionClient(null);
      const service = new SubscriptionAccessService(client);
      await expect(
         service.evaluateAccess(SubscriptionTierLevel.BASE, null, null, AuthRole.LISTENER),
      ).resolves.toMatchObject({
         canAccess: false,
         message: 'forbidden.login_required',
      });
      expect(client.getUserHighestActiveTier).not.toHaveBeenCalled();
   });

   it('evaluateAccess denies GUEST users regardless of tier (login gate)', async () => {
      const client = buildMockSubscriptionClient(null);
      const service = new SubscriptionAccessService(client);
      await expect(
         service.evaluateAccess(null, userId, accessToken, AuthRole.GUEST),
      ).resolves.toMatchObject({
         canAccess: false,
         message: 'forbidden.login_required',
      });
      expect(client.getUserHighestActiveTier).not.toHaveBeenCalled();
   });

   it('evaluateAccess bypasses subscription lookup for non-listener roles', async () => {
      const client = buildMockSubscriptionClient(SubscriptionTierLevel.STANDARD);
      const service = new SubscriptionAccessService(client);
      await expect(
         service.evaluateAccess(SubscriptionTierLevel.STANDARD, userId, accessToken, AuthRole.AUTHOR),
      ).resolves.toMatchObject({
         canAccess: true,
         requiredTier: SubscriptionTierLevel.STANDARD,
      });
      expect(client.getUserHighestActiveTier).not.toHaveBeenCalled();
   });

   it('openAccess always grants audiobook detail access', () => {
      const service = new SubscriptionAccessService(buildMockSubscriptionClient(null));
      expect(service.openAccess()).toEqual({ canAccess: true });
   });
});
