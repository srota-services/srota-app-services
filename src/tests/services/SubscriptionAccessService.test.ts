import { SubscriptionGatingMode } from '@prisma/client';
import { SubscriptionAccessService } from '../../services/SubscriptionAccessService';

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
      await expect(service.evaluateAccess(2, userId, accessToken)).resolves.toMatchObject({
         canAccess: true,
         userTier: 2,
      });
   });

   it('openAccess always grants audiobook detail access', () => {
      const service = new SubscriptionAccessService(buildMockSubscriptionClient(null));
      expect(service.openAccess()).toEqual({ canAccess: true });
   });
});
