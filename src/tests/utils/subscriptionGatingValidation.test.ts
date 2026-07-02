import { SubscriptionGatingMode, SubscriptionTierLevel } from '@prisma/client';
import {
   countTierStepUps,
   isNonDecreasingSequence,
   tierToOrder,
} from '../../constants/subscriptionTierLevel';
import {
   resolveAudiobookGatingCreate,
   resolveAudiobookGatingUpdate,
   assertChapterTierAllowed,
   validateMinSubscriptionTierValue,
   parseOptionalMinSubscriptionTierFromForm,
   validateChapterTierSequence,
   validateTierNotReduced,
   resolveChapterTierForCreate,
   resolveChapterTierForUpdate,
   syncChapterTiersForAudiobook,
} from '../../utils/subscriptionGatingValidation';
import { ApiError } from '../../types/ApiError';

jest.mock('../../utils/MessageHandler', () => ({
   MessageHandler: {
      getErrorMessage: (key: string) => key,
   },
}));

describe('subscriptionTierLevel helpers', () => {
   it('tierToOrder maps null to 0 and tiers to 1-3', () => {
      expect(tierToOrder(null)).toBe(0);
      expect(tierToOrder(SubscriptionTierLevel.BASE)).toBe(1);
      expect(tierToOrder(SubscriptionTierLevel.PREMIUM)).toBe(3);
   });

   it('countTierStepUps counts adjacent increases only', () => {
      const chapters = [
         { chapterNumber: 1, minSubscriptionTier: null },
         { chapterNumber: 2, minSubscriptionTier: SubscriptionTierLevel.BASE },
         { chapterNumber: 3, minSubscriptionTier: SubscriptionTierLevel.BASE },
         { chapterNumber: 4, minSubscriptionTier: SubscriptionTierLevel.STANDARD },
      ];
      expect(countTierStepUps(chapters)).toBe(2);
      expect(isNonDecreasingSequence(chapters)).toBe(true);
   });

   it('detects decreasing sequence', () => {
      const chapters = [
         { chapterNumber: 1, minSubscriptionTier: SubscriptionTierLevel.STANDARD },
         { chapterNumber: 2, minSubscriptionTier: SubscriptionTierLevel.BASE },
      ];
      expect(isNonDecreasingSequence(chapters)).toBe(false);
   });
});

describe('subscriptionGatingValidation', () => {
   describe('validateChapterTierSequence', () => {
      it('accepts valid example: free, base, standard, standard', () => {
         expect(() =>
            validateChapterTierSequence(
               [
                  { id: 'c1', chapterNumber: 1, minSubscriptionTier: null },
                  { id: 'c2', chapterNumber: 2, minSubscriptionTier: SubscriptionTierLevel.BASE },
                  { id: 'c3', chapterNumber: 3, minSubscriptionTier: SubscriptionTierLevel.STANDARD },
               ],
               { id: 'c4', chapterNumber: 4, minSubscriptionTier: SubscriptionTierLevel.STANDARD },
            ),
         ).not.toThrow();
      });

      it('rejects third step-up to PREMIUM', () => {
         expect(() =>
            validateChapterTierSequence(
               [
                  { id: 'c1', chapterNumber: 1, minSubscriptionTier: null },
                  { id: 'c2', chapterNumber: 2, minSubscriptionTier: SubscriptionTierLevel.BASE },
                  { id: 'c3', chapterNumber: 3, minSubscriptionTier: SubscriptionTierLevel.STANDARD },
               ],
               { id: 'c4', chapterNumber: 4, minSubscriptionTier: SubscriptionTierLevel.PREMIUM },
            ),
         ).toThrow(ApiError);
      });

      it('rejects tier reduction on update', () => {
         expect(() =>
            validateChapterTierSequence(
               [{ id: 'c2', chapterNumber: 2, minSubscriptionTier: SubscriptionTierLevel.STANDARD }],
               { id: 'c2', chapterNumber: 2, minSubscriptionTier: SubscriptionTierLevel.BASE },
               SubscriptionTierLevel.STANDARD,
            ),
         ).toThrow(ApiError);
      });
   });

   describe('validateTierNotReduced', () => {
      it('allows same or higher tier', () => {
         expect(() =>
            validateTierNotReduced(SubscriptionTierLevel.BASE, SubscriptionTierLevel.STANDARD),
         ).not.toThrow();
      });

      it('rejects lower tier', () => {
         expect(() =>
            validateTierNotReduced(SubscriptionTierLevel.STANDARD, SubscriptionTierLevel.BASE),
         ).toThrow(ApiError);
      });
   });

   describe('resolveAudiobookGatingCreate', () => {
      it('defaults to NONE when no gating input', () => {
         expect(resolveAudiobookGatingCreate({})).toEqual({
            subscriptionGatingMode: SubscriptionGatingMode.NONE,
            minSubscriptionTier: null,
            chapterSyncTier: null,
         });
      });

      it('creates AUDIOBOOK mode with tier', () => {
         expect(
            resolveAudiobookGatingCreate({
               subscriptionGatingMode: 'AUDIOBOOK',
               minSubscriptionTier: SubscriptionTierLevel.STANDARD,
            }),
         ).toEqual({
            subscriptionGatingMode: SubscriptionGatingMode.AUDIOBOOK,
            minSubscriptionTier: SubscriptionTierLevel.STANDARD,
            chapterSyncTier: null,
         });
      });

      it('creates CHAPTER mode without audiobook tier', () => {
         expect(
            resolveAudiobookGatingCreate({
               subscriptionGatingMode: 'CHAPTER',
            }),
         ).toEqual({
            subscriptionGatingMode: SubscriptionGatingMode.CHAPTER,
            minSubscriptionTier: null,
            chapterSyncTier: null,
         });
      });

      it('creates CHAPTER mode when minSubscriptionTier is 0 (ignored at audiobook level)', () => {
         expect(
            resolveAudiobookGatingCreate({
               subscriptionGatingMode: 'CHAPTER',
               minSubscriptionTier: 0 as unknown as SubscriptionTierLevel,
            }),
         ).toEqual({
            subscriptionGatingMode: SubscriptionGatingMode.CHAPTER,
            minSubscriptionTier: null,
            chapterSyncTier: null,
         });
      });

      it('rejects AUDIOBOOK mode without tier', () => {
         expect(() =>
            resolveAudiobookGatingCreate({
               subscriptionGatingMode: 'AUDIOBOOK',
               minSubscriptionTier: null,
            }),
         ).toThrow(ApiError);
      });
   });

   describe('resolveAudiobookGatingUpdate', () => {
      const mockPrisma = {
         chapter: {
            findMany: jest.fn().mockResolvedValue([
               { minSubscriptionTier: SubscriptionTierLevel.STANDARD },
            ]),
         },
      } as any;

      it('switches to CHAPTER mode without requiring audiobook tier', async () => {
         const result = await resolveAudiobookGatingUpdate(
            mockPrisma,
            'ab-1',
            {
               subscriptionGatingMode: SubscriptionGatingMode.AUDIOBOOK,
               minSubscriptionTier: SubscriptionTierLevel.STANDARD,
            },
            { subscriptionGatingMode: 'CHAPTER' },
         );

         expect(result).toEqual({
            subscriptionGatingMode: SubscriptionGatingMode.CHAPTER,
            minSubscriptionTier: null,
            chapterSyncTier: null,
         });
      });

      it('rejects audiobook tier decrease', async () => {
         await expect(
            resolveAudiobookGatingUpdate(
               mockPrisma,
               'ab-1',
               {
                  subscriptionGatingMode: SubscriptionGatingMode.AUDIOBOOK,
                  minSubscriptionTier: SubscriptionTierLevel.STANDARD,
               },
               { minSubscriptionTier: SubscriptionTierLevel.BASE },
            ),
         ).rejects.toBeInstanceOf(ApiError);
      });

      it('uses max chapter tier when switching CHAPTER to AUDIOBOOK without explicit tier', async () => {
         const result = await resolveAudiobookGatingUpdate(
            mockPrisma,
            'ab-1',
            {
               subscriptionGatingMode: SubscriptionGatingMode.CHAPTER,
               minSubscriptionTier: null,
            },
            { subscriptionGatingMode: 'AUDIOBOOK' },
         );

         expect(result.minSubscriptionTier).toBe(SubscriptionTierLevel.STANDARD);
      });
   });

   describe('syncChapterTiersForAudiobook', () => {
      it('sets all chapter tiers to audiobook tier in AUDIOBOOK mode', async () => {
         const updateMany = jest.fn().mockResolvedValue({ count: 2 });
         const tx = { chapter: { updateMany } } as any;

         await syncChapterTiersForAudiobook(tx, 'ab-1', {
            subscriptionGatingMode: SubscriptionGatingMode.AUDIOBOOK,
            minSubscriptionTier: SubscriptionTierLevel.BASE,
            chapterSyncTier: null,
         });

         expect(updateMany).toHaveBeenCalledWith({
            where: { audiobookId: 'ab-1' },
            data: { minSubscriptionTier: SubscriptionTierLevel.BASE },
         });
      });

      it('does not update chapters in CHAPTER mode', async () => {
         const updateMany = jest.fn();
         const tx = { chapter: { updateMany } } as any;

         await syncChapterTiersForAudiobook(tx, 'ab-1', {
            subscriptionGatingMode: SubscriptionGatingMode.CHAPTER,
            minSubscriptionTier: null,
            chapterSyncTier: null,
         });

         expect(updateMany).not.toHaveBeenCalled();
      });
   });

   describe('resolveChapterTierForCreate', () => {
      const mockPrisma = {
         audioBook: {
            findUnique: jest.fn(),
         },
         chapter: {
            findMany: jest.fn().mockResolvedValue([]),
         },
      } as any;

      beforeEach(() => {
         jest.clearAllMocks();
      });

      it('inherits audiobook tier in AUDIOBOOK mode', async () => {
         mockPrisma.audioBook.findUnique.mockResolvedValue({
            subscriptionGatingMode: SubscriptionGatingMode.AUDIOBOOK,
            minSubscriptionTier: SubscriptionTierLevel.STANDARD,
         });

         await expect(
            resolveChapterTierForCreate(mockPrisma, 'ab-1', 1, undefined),
         ).resolves.toBe(SubscriptionTierLevel.STANDARD);
      });

      it('defaults chapter 1 to free in CHAPTER mode', async () => {
         mockPrisma.audioBook.findUnique.mockResolvedValue({
            subscriptionGatingMode: SubscriptionGatingMode.CHAPTER,
            minSubscriptionTier: null,
         });

         await expect(
            resolveChapterTierForCreate(mockPrisma, 'ab-1', 1, undefined),
         ).resolves.toBeNull();
      });

      it('rejects paid tier on chapter 1 in CHAPTER mode', async () => {
         mockPrisma.audioBook.findUnique.mockResolvedValue({
            subscriptionGatingMode: SubscriptionGatingMode.CHAPTER,
            minSubscriptionTier: null,
         });

         await expect(
            resolveChapterTierForCreate(mockPrisma, 'ab-1', 1, SubscriptionTierLevel.BASE),
         ).rejects.toBeInstanceOf(ApiError);
      });

      it('requires explicit tier in CHAPTER mode for chapter 2 and later', async () => {
         mockPrisma.audioBook.findUnique.mockResolvedValue({
            subscriptionGatingMode: SubscriptionGatingMode.CHAPTER,
            minSubscriptionTier: null,
         });

         await expect(
            resolveChapterTierForCreate(mockPrisma, 'ab-1', 2, undefined),
         ).rejects.toBeInstanceOf(ApiError);
      });

      it('validates sequence in CHAPTER mode when tier decreases later in order', async () => {
         mockPrisma.audioBook.findUnique.mockResolvedValue({
            subscriptionGatingMode: SubscriptionGatingMode.CHAPTER,
            minSubscriptionTier: null,
         });
         mockPrisma.chapter.findMany.mockResolvedValue([
            { id: 'c1', chapterNumber: 1, minSubscriptionTier: SubscriptionTierLevel.STANDARD },
         ]);

         await expect(
            resolveChapterTierForCreate(
               mockPrisma,
               'ab-1',
               2,
               SubscriptionTierLevel.BASE,
            ),
         ).rejects.toBeInstanceOf(ApiError);
      });
   });

   describe('resolveChapterTierForUpdate', () => {
      const mockPrisma = {
         audioBook: {
            findUnique: jest.fn(),
         },
         chapter: {
            findMany: jest.fn().mockResolvedValue([]),
         },
      } as any;

      it('rejects tier update in AUDIOBOOK mode', async () => {
         mockPrisma.audioBook.findUnique.mockResolvedValue({
            subscriptionGatingMode: SubscriptionGatingMode.AUDIOBOOK,
         });

         await expect(
            resolveChapterTierForUpdate(
               mockPrisma,
               'ab-1',
               'c1',
               { chapterNumber: 1, minSubscriptionTier: SubscriptionTierLevel.BASE },
               { minSubscriptionTier: SubscriptionTierLevel.STANDARD },
            ),
         ).rejects.toBeInstanceOf(ApiError);
      });

      it('rejects chapter reorder that breaks sequence', async () => {
         mockPrisma.audioBook.findUnique.mockResolvedValue({
            subscriptionGatingMode: SubscriptionGatingMode.CHAPTER,
         });
         mockPrisma.chapter.findMany.mockResolvedValue([
            { id: 'c2', chapterNumber: 2, minSubscriptionTier: SubscriptionTierLevel.BASE },
         ]);

         await expect(
            resolveChapterTierForUpdate(
               mockPrisma,
               'ab-1',
               'c1',
               { chapterNumber: 3, minSubscriptionTier: SubscriptionTierLevel.STANDARD },
               { chapterNumber: 1 },
            ),
         ).rejects.toBeInstanceOf(ApiError);
      });
   });

   describe('assertChapterTierAllowed', () => {
      it('rejects chapter tier when audiobook uses AUDIOBOOK mode', () => {
         expect(() =>
            assertChapterTierAllowed(SubscriptionGatingMode.AUDIOBOOK, SubscriptionTierLevel.STANDARD),
         ).toThrow(ApiError);
      });
   });

   describe('validateMinSubscriptionTierValue', () => {
      it('accepts valid tier values', () => {
         expect(validateMinSubscriptionTierValue(SubscriptionTierLevel.BASE)).toBe(SubscriptionTierLevel.BASE);
         expect(validateMinSubscriptionTierValue(null)).toBeNull();
      });

      it('accepts numeric aliases 1/2/3 from form-data', () => {
         expect(validateMinSubscriptionTierValue(1)).toBe(SubscriptionTierLevel.BASE);
         expect(validateMinSubscriptionTierValue(2)).toBe(SubscriptionTierLevel.STANDARD);
         expect(validateMinSubscriptionTierValue(3)).toBe(SubscriptionTierLevel.PREMIUM);
         expect(validateMinSubscriptionTierValue('3')).toBe(SubscriptionTierLevel.PREMIUM);
      });
   });

   describe('parseOptionalMinSubscriptionTierFromForm', () => {
      it('parses numeric alias "0" to free (null)', () => {
         expect(parseOptionalMinSubscriptionTierFromForm('0')).toBeNull();
      });

      it('parses numeric alias "2" to STANDARD', () => {
         expect(parseOptionalMinSubscriptionTierFromForm('2')).toBe(SubscriptionTierLevel.STANDARD);
      });
   });
});
