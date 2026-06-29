import { SubscriptionGatingMode } from '@prisma/client';
import { ChapterService } from '../../services/ChapterService';
import { SubscriptionAccessService } from '../../services/SubscriptionAccessService';
import { ApiError } from '../../types/ApiError';
import { AuthRole } from '../../constants/authRoles';

jest.mock('../../utils/subscriptionGatingValidation', () => ({
   resolveChapterTierForCreate: jest.fn(),
   resolveChapterTierForUpdate: jest.fn(),
}));

jest.mock('../../utils/MessageHandler', () => ({
   MessageHandler: {
      getErrorMessage: (key: string) => key,
   },
}));

import { resolveChapterTierForCreate } from '../../utils/subscriptionGatingValidation';

describe('ChapterService subscription gating', () => {
   it('getSubscriptionAccessForChapter evaluates chapter tier in CHAPTER mode', async () => {
      const subscriptionAccessService = new SubscriptionAccessService({
         getUserHighestActiveTier: jest.fn().mockResolvedValue(2),
      } as any);
      const service = new ChapterService({} as any, undefined, subscriptionAccessService);

      const access = await service.getSubscriptionAccessForChapter(
         { minSubscriptionTier: 2 },
         { subscriptionGatingMode: SubscriptionGatingMode.CHAPTER, minSubscriptionTier: null },
         'user-1',
         'token',
         AuthRole.LISTENER,
      );

      expect(access).toMatchObject({ canAccess: true, userTier: 2 });
   });

   it('getSubscriptionAccessForChapter uses audiobook tier in AUDIOBOOK mode', async () => {
      const subscriptionAccessService = new SubscriptionAccessService({
         getUserHighestActiveTier: jest.fn().mockResolvedValue(2),
      } as any);
      const service = new ChapterService({} as any, undefined, subscriptionAccessService);

      const access = await service.getSubscriptionAccessForChapter(
         { minSubscriptionTier: null },
         { subscriptionGatingMode: SubscriptionGatingMode.AUDIOBOOK, minSubscriptionTier: 1 },
         'user-1',
         'token',
      );

      expect(access).toMatchObject({ canAccess: true, requiredTier: 1 });
   });

   it('createChapter rejects tier when resolveChapterTierForCreate throws', async () => {
      (resolveChapterTierForCreate as jest.Mock).mockRejectedValue(
         ApiError.validationError('validation.chapter_tier_not_allowed'),
      );

      const mockPrisma = {
         audioBook: {
            findUnique: jest.fn().mockResolvedValue({
               id: 'ab-1',
               subscriptionGatingMode: SubscriptionGatingMode.AUDIOBOOK,
            }),
         },
         chapter: {
            findFirst: jest.fn(),
            create: jest.fn(),
         },
      } as any;

      const service = new ChapterService(mockPrisma);

      await expect(
         service.createChapter({
            audiobookId: 'ab-1',
            title: 'Chapter 1',
            chapterNumber: 1,
            duration: 100,
            startPosition: 0,
            endPosition: 100,
            coverImage: 'cover.jpg',
            minSubscriptionTier: 2,
         }),
      ).rejects.toBeInstanceOf(ApiError);
   });
});
