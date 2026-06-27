import { SubscriptionGatingMode } from '@prisma/client';
import {
   resolveAudiobookGatingCreate,
   resolveAudiobookGatingUpdate,
   assertChapterTierAllowed,
   validateMinSubscriptionTierValue,
} from '../../utils/subscriptionGatingValidation';
import { ApiError } from '../../types/ApiError';

describe('subscriptionGatingValidation', () => {
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
               minSubscriptionTier: 2,
            }),
         ).toEqual({
            subscriptionGatingMode: SubscriptionGatingMode.AUDIOBOOK,
            minSubscriptionTier: 2,
            chapterSyncTier: null,
         });
      });

      it('creates CHAPTER mode with tier on chapters only', () => {
         expect(
            resolveAudiobookGatingCreate({
               subscriptionGatingMode: 'CHAPTER',
               minSubscriptionTier: 2,
            }),
         ).toEqual({
            subscriptionGatingMode: SubscriptionGatingMode.CHAPTER,
            minSubscriptionTier: null,
            chapterSyncTier: 2,
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

   describe('assertChapterTierAllowed', () => {
      it('rejects chapter tier when audiobook uses AUDIOBOOK mode', () => {
         expect(() =>
            assertChapterTierAllowed(SubscriptionGatingMode.AUDIOBOOK, 2),
         ).toThrow(ApiError);
      });

      it('allows chapter tier when audiobook uses CHAPTER mode', () => {
         expect(() =>
            assertChapterTierAllowed(SubscriptionGatingMode.CHAPTER, 2),
         ).not.toThrow();
      });
   });

   describe('resolveAudiobookGatingUpdate', () => {
      const mockPrisma = {
         chapter: {
            findMany: jest.fn().mockResolvedValue([]),
         },
      } as any;

      it('migrates tier from audiobook to chapters when switching to CHAPTER', async () => {
         const result = await resolveAudiobookGatingUpdate(
            mockPrisma,
            'ab-1',
            {
               subscriptionGatingMode: SubscriptionGatingMode.AUDIOBOOK,
               minSubscriptionTier: 2,
            },
            { subscriptionGatingMode: 'CHAPTER' },
         );

         expect(result).toEqual({
            subscriptionGatingMode: SubscriptionGatingMode.CHAPTER,
            minSubscriptionTier: null,
            chapterSyncTier: 2,
         });
      });
   });

   describe('validateMinSubscriptionTierValue', () => {
      it('rejects negative tiers', () => {
         expect(() => validateMinSubscriptionTierValue(-1)).toThrow(ApiError);
      });
   });
});
