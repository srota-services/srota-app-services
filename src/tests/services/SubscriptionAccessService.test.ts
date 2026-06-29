import { SubscriptionGatingMode } from '@prisma/client';
import { SubscriptionAccessService } from '../../services/SubscriptionAccessService';
import { AuthRole } from '../../constants/authRoles';

function buildMockSubscriptionClient(tier: number | null) {
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
            minSubscriptionTier: 2,
         }),
      ).toBe(2);

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
               minSubscriptionTier: 2,
            },
            { minSubscriptionTier: null },
         ),
      ).toBe(2);
   });

   it('resolveChapterRequiredTier uses chapter tier in CHAPTER mode', () => {
      const service = new SubscriptionAccessService(buildMockSubscriptionClient(null));

      expect(
         service.resolveChapterRequiredTier(
            {
               subscriptionGatingMode: SubscriptionGatingMode.CHAPTER,
               minSubscriptionTier: null,
            },
            { minSubscriptionTier: 3 },
         ),
      ).toBe(3);
   });

   it('evaluateAccess grants access when tier qualifies', async () => {
      const service = new SubscriptionAccessService(buildMockSubscriptionClient(2));
      await expect(
         service.evaluateAccess(2, userId, accessToken, AuthRole.LISTENER),
      ).resolves.toMatchObject({
         canAccess: true,
         userTier: 2,
      });
   });

   it('evaluateAccess grants access when required tier is 0 and user has no subscription', async () => {
      const client = buildMockSubscriptionClient(null);
      const service = new SubscriptionAccessService(client);
      await expect(
         service.evaluateAccess(0, userId, accessToken, AuthRole.LISTENER),
      ).resolves.toMatchObject({
         canAccess: true,
         requiredTier: 0,
      });
      expect(client.getUserHighestActiveTier).not.toHaveBeenCalled();
   });

   it('evaluateAccess denies access when required tier is 0 and user is not logged in', async () => {
      const client = buildMockSubscriptionClient(null);
      const service = new SubscriptionAccessService(client);
      await expect(
         service.evaluateAccess(0, null, null, AuthRole.LISTENER),
      ).resolves.toMatchObject({
         canAccess: false,
         requiredTier: 0,
         userTier: null,
      });
      expect(client.getUserHighestActiveTier).not.toHaveBeenCalled();
   });

   it('evaluateAccess bypasses subscription lookup for non-listener roles', async () => {
      const client = buildMockSubscriptionClient(2);
      const service = new SubscriptionAccessService(client);
      await expect(
         service.evaluateAccess(2, userId, accessToken, AuthRole.AUTHOR),
      ).resolves.toMatchObject({
         canAccess: true,
         requiredTier: 2,
      });
      expect(client.getUserHighestActiveTier).not.toHaveBeenCalled();
   });

   it('openAccess always grants audiobook detail access', () => {
      const service = new SubscriptionAccessService(buildMockSubscriptionClient(null));
      expect(service.openAccess()).toEqual({ canAccess: true });
   });
});
