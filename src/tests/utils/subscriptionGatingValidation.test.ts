import { SubscriptionGatingMode, SubscriptionTierLevel } from '@prisma/client';
import {
   resolveAudiobookGatingCreate,
   resolveAudiobookGatingUpdate,
   assertChapterTierAllowed,
   validateMinSubscriptionTierValue,
   parseOptionalMinSubscriptionTierFromForm,
} from '../../utils/subscriptionGatingValidation';
import { ApiError } from '../../types/ApiError';

jest.mock('../../utils/MessageHandler', () => ({
   MessageHandler: {
      getErrorMessage: (key: string) => key,
   },
}));

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
               minSubscriptionTier: SubscriptionTierLevel.STANDARD,
            }),
         ).toEqual({
            subscriptionGatingMode: SubscriptionGatingMode.AUDIOBOOK,
            minSubscriptionTier: SubscriptionTierLevel.STANDARD,
            chapterSyncTier: null,
         });
      });

      it('creates CHAPTER mode with tier on chapters only', () => {
         expect(
            resolveAudiobookGatingCreate({
               subscriptionGatingMode: 'CHAPTER',
               minSubscriptionTier: SubscriptionTierLevel.STANDARD,
            }),
         ).toEqual({
            subscriptionGatingMode: SubscriptionGatingMode.CHAPTER,
            minSubscriptionTier: null,
            chapterSyncTier: SubscriptionTierLevel.STANDARD,
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
            assertChapterTierAllowed(SubscriptionGatingMode.AUDIOBOOK, SubscriptionTierLevel.STANDARD),
         ).toThrow(ApiError);
      });

      it('allows chapter tier when audiobook uses CHAPTER mode', () => {
         expect(() =>
            assertChapterTierAllowed(SubscriptionGatingMode.CHAPTER, SubscriptionTierLevel.STANDARD),
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
               minSubscriptionTier: SubscriptionTierLevel.STANDARD,
            },
            { subscriptionGatingMode: 'CHAPTER' },
         );

         expect(result).toEqual({
            subscriptionGatingMode: SubscriptionGatingMode.CHAPTER,
            minSubscriptionTier: null,
            chapterSyncTier: SubscriptionTierLevel.STANDARD,
         });
      });
   });

   describe('validateMinSubscriptionTierValue', () => {
      it('accepts valid tier values', () => {
         expect(validateMinSubscriptionTierValue(SubscriptionTierLevel.BASE)).toBe(SubscriptionTierLevel.BASE);
         expect(validateMinSubscriptionTierValue(SubscriptionTierLevel.STANDARD)).toBe(SubscriptionTierLevel.STANDARD);
         expect(validateMinSubscriptionTierValue(SubscriptionTierLevel.PREMIUM)).toBe(SubscriptionTierLevel.PREMIUM);
         expect(validateMinSubscriptionTierValue(null)).toBeNull();
      });

      it('rejects invalid string values', () => {
         expect(() => validateMinSubscriptionTierValue('INVALID' as any)).toThrow(ApiError);
      });
   });

   describe('parseOptionalMinSubscriptionTierFromForm', () => {
      it('parses numeric alias "2" to STANDARD', () => {
         expect(parseOptionalMinSubscriptionTierFromForm('2')).toBe(SubscriptionTierLevel.STANDARD);
      });

      it('parses enum name "STANDARD" to STANDARD', () => {
         expect(parseOptionalMinSubscriptionTierFromForm('STANDARD')).toBe(SubscriptionTierLevel.STANDARD);
      });

      it('returns undefined when field is omitted', () => {
         expect(parseOptionalMinSubscriptionTierFromForm(undefined)).toBeUndefined();
      });

      it('returns null for explicit empty or null form values', () => {
         expect(parseOptionalMinSubscriptionTierFromForm('')).toBeNull();
         expect(parseOptionalMinSubscriptionTierFromForm('null')).toBeNull();
      });

      it('rejects invalid values', () => {
         expect(() => parseOptionalMinSubscriptionTierFromForm('INVALID')).toThrow(ApiError);
      });
   });
});
