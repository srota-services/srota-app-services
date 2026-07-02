import { Prisma, PrismaClient, SubscriptionGatingMode, SubscriptionTierLevel } from '@prisma/client';
import { ApiError } from '../types/ApiError';
import { MessageHandler } from './MessageHandler';
import {
   ALL_TIER_LEVELS,
   ChapterTierRow,
   MAX_CHAPTER_TIER_INCREASES,
   TIER_NUMERIC_ALIAS,
   countTierStepUps,
   isFreeTierInput,
   isNonDecreasingSequence,
   maxTierLevelFromChapters,
   sortChaptersByNumber,
   tierToOrder,
} from '../constants/subscriptionTierLevel';

export type SubscriptionGatingModeInput = SubscriptionGatingMode | 'NONE' | 'AUDIOBOOK' | 'CHAPTER';

export interface AudiobookGatingInput {
   subscriptionGatingMode?: SubscriptionGatingModeInput;
   minSubscriptionTier?: SubscriptionTierLevel | null;
}

export interface ResolvedAudiobookGating {
   subscriptionGatingMode: SubscriptionGatingMode;
   /** Value stored on the audiobook row. */
   minSubscriptionTier: SubscriptionTierLevel | null;
   /** @deprecated Always null in CHAPTER mode; kept for interface compatibility. */
   chapterSyncTier: SubscriptionTierLevel | null;
}

export function parseSubscriptionGatingMode(
   value: SubscriptionGatingModeInput | string | undefined,
): SubscriptionGatingMode | undefined {
   if (value === undefined) {
      return undefined;
   }
   const normalized = String(value).toUpperCase();
   if (normalized === 'NONE') return SubscriptionGatingMode.NONE;
   if (normalized === 'AUDIOBOOK') return SubscriptionGatingMode.AUDIOBOOK;
   if (normalized === 'CHAPTER') return SubscriptionGatingMode.CHAPTER;
   throw ApiError.validationError(
      MessageHandler.getErrorMessage('validation.subscription_gating_mode_invalid'),
   );
}

export function validateMinSubscriptionTierValue(
   value: SubscriptionTierLevel | string | null | undefined,
): SubscriptionTierLevel | null {
   if (isFreeTierInput(value)) {
      return null;
   }
   if (ALL_TIER_LEVELS.includes(value as SubscriptionTierLevel)) {
      return value as SubscriptionTierLevel;
   }
   throw ApiError.validationError(
      MessageHandler.getErrorMessage('validation.min_subscription_tier_invalid'),
   );
}

export function parseOptionalMinSubscriptionTierFromForm(
   value: unknown,
): SubscriptionTierLevel | null | undefined {
   if (value === undefined) {
      return undefined;
   }
   if (value === null || value === '' || value === 'null') {
      return null;
   }
   const str = String(value).trim();
   if (str in TIER_NUMERIC_ALIAS) {
      return TIER_NUMERIC_ALIAS[str]!;
   }
   return validateMinSubscriptionTierValue(str);
}

export function inferGatingModeFromLegacyTier(
   minSubscriptionTier: SubscriptionTierLevel | null | undefined,
): SubscriptionGatingMode {
   return minSubscriptionTier !== null && minSubscriptionTier !== undefined
      ? SubscriptionGatingMode.AUDIOBOOK
      : SubscriptionGatingMode.NONE;
}

export function validateTierNotReduced(
   existing: SubscriptionTierLevel | null,
   next: SubscriptionTierLevel | null,
): void {
   if (tierToOrder(next) < tierToOrder(existing)) {
      throw ApiError.validationError(
         MessageHandler.getErrorMessage('validation.subscription_tier_cannot_decrease'),
      );
   }
}

export function validateAudiobookTierNotReduced(
   existing: SubscriptionTierLevel | null,
   next: SubscriptionTierLevel | null,
): void {
   if (existing !== null && next !== null) {
      validateTierNotReduced(existing, next);
   }
}

/** Build proposed chapter list with candidate inserted/replaced, then validate sequence rules. */
export function validateChapterTierSequence(
   chapters: ChapterTierRow[],
   candidate: ChapterTierRow,
   existingTier?: SubscriptionTierLevel | null,
): void {
   if (existingTier !== undefined && candidate.id !== undefined) {
      validateTierNotReduced(existingTier, candidate.minSubscriptionTier);
   }

   const withoutCandidate = chapters.filter((ch) => ch.id !== candidate.id);
   const proposed = sortChaptersByNumber([...withoutCandidate, candidate]);

   if (!isNonDecreasingSequence(proposed)) {
      throw ApiError.validationError(
         MessageHandler.getErrorMessage('validation.chapter_tier_sequence_invalid'),
      );
   }

   if (countTierStepUps(proposed) > MAX_CHAPTER_TIER_INCREASES) {
      throw ApiError.validationError(
         MessageHandler.getErrorMessage('validation.chapter_tier_increase_limit_exceeded'),
      );
   }
}

export async function getMaxChapterTier(
   prisma: PrismaClient | Prisma.TransactionClient,
   audiobookId: string,
): Promise<SubscriptionTierLevel | null> {
   const chapters = await prisma.chapter.findMany({
      where: { audiobookId },
      select: { minSubscriptionTier: true },
   });
   return maxTierLevelFromChapters(chapters);
}

export async function loadChapterTierRows(
   prisma: PrismaClient | Prisma.TransactionClient,
   audiobookId: string,
   excludeChapterId?: string,
): Promise<ChapterTierRow[]> {
   const chapters = await prisma.chapter.findMany({
      where: {
         audiobookId,
         ...(excludeChapterId ? { id: { not: excludeChapterId } } : {}),
      },
      select: { id: true, chapterNumber: true, minSubscriptionTier: true },
   });
   return chapters;
}

export async function validateChapterTierSequenceForAudiobook(
   prisma: PrismaClient | Prisma.TransactionClient,
   audiobookId: string,
   candidate: ChapterTierRow,
   existingTier?: SubscriptionTierLevel | null,
): Promise<void> {
   const siblings = await loadChapterTierRows(
      prisma,
      audiobookId,
      candidate.id,
   );
   validateChapterTierSequence(siblings, candidate, existingTier);
}

export async function resolveAudiobookGatingUpdate(
   prisma: PrismaClient | Prisma.TransactionClient,
   audiobookId: string,
   existing: { subscriptionGatingMode: SubscriptionGatingMode; minSubscriptionTier: SubscriptionTierLevel | null },
   input: AudiobookGatingInput,
): Promise<ResolvedAudiobookGating> {
   const parsedMode =
      input.subscriptionGatingMode !== undefined
         ? parseSubscriptionGatingMode(input.subscriptionGatingMode)
         : undefined;

   if (parsedMode === SubscriptionGatingMode.CHAPTER) {
      return {
         subscriptionGatingMode: SubscriptionGatingMode.CHAPTER,
         minSubscriptionTier: null,
         chapterSyncTier: null,
      };
   }

   const parsedTier =
      input.minSubscriptionTier !== undefined
         ? validateMinSubscriptionTierValue(input.minSubscriptionTier)
         : undefined;

   let mode = parsedMode ?? existing.subscriptionGatingMode;

   if (parsedMode === undefined && parsedTier !== undefined && parsedTier !== null) {
      mode = SubscriptionGatingMode.AUDIOBOOK;
   }
   if (
      parsedMode === undefined &&
      parsedTier === null &&
      existing.subscriptionGatingMode === SubscriptionGatingMode.AUDIOBOOK
   ) {
      mode = SubscriptionGatingMode.NONE;
   }

   if (mode === SubscriptionGatingMode.NONE) {
      return {
         subscriptionGatingMode: SubscriptionGatingMode.NONE,
         minSubscriptionTier: null,
         chapterSyncTier: null,
      };
   }

   if (mode === SubscriptionGatingMode.AUDIOBOOK) {
      let tier = parsedTier ?? existing.minSubscriptionTier;
      if (tier === null && existing.subscriptionGatingMode === SubscriptionGatingMode.CHAPTER) {
         tier = await getMaxChapterTier(prisma, audiobookId);
      }
      if (tier === null) {
         throw ApiError.validationError(
            MessageHandler.getErrorMessage('validation.subscription_gating_tier_required'),
         );
      }
      if (
         existing.subscriptionGatingMode === SubscriptionGatingMode.AUDIOBOOK &&
         existing.minSubscriptionTier !== null &&
         parsedTier !== undefined
      ) {
         validateAudiobookTierNotReduced(existing.minSubscriptionTier, tier);
      }
      return {
         subscriptionGatingMode: SubscriptionGatingMode.AUDIOBOOK,
         minSubscriptionTier: tier,
         chapterSyncTier: null,
      };
   }

   // CHAPTER mode — per-chapter tiers; audiobook row stores null
   return {
      subscriptionGatingMode: SubscriptionGatingMode.CHAPTER,
      minSubscriptionTier: null,
      chapterSyncTier: null,
   };
}

export function resolveAudiobookGatingCreate(input: AudiobookGatingInput): ResolvedAudiobookGating {
   const parsedMode =
      input.subscriptionGatingMode !== undefined
         ? parseSubscriptionGatingMode(input.subscriptionGatingMode)
         : undefined;

   // CHAPTER mode ignores audiobook-level tier; tiers are set per chapter at creation.
   if (parsedMode === SubscriptionGatingMode.CHAPTER) {
      return {
         subscriptionGatingMode: SubscriptionGatingMode.CHAPTER,
         minSubscriptionTier: null,
         chapterSyncTier: null,
      };
   }

   const parsedTier =
      input.minSubscriptionTier !== undefined
         ? validateMinSubscriptionTierValue(input.minSubscriptionTier)
         : undefined;

   let mode = parsedMode ?? inferGatingModeFromLegacyTier(parsedTier);

   if (parsedMode === undefined && parsedTier !== undefined && parsedTier !== null) {
      mode = SubscriptionGatingMode.AUDIOBOOK;
   }

   if (mode === SubscriptionGatingMode.NONE) {
      return {
         subscriptionGatingMode: SubscriptionGatingMode.NONE,
         minSubscriptionTier: null,
         chapterSyncTier: null,
      };
   }

   if (mode === SubscriptionGatingMode.AUDIOBOOK) {
      if (parsedTier === null || parsedTier === undefined) {
         throw ApiError.validationError(
            MessageHandler.getErrorMessage('validation.subscription_gating_tier_required'),
         );
      }
      return {
         subscriptionGatingMode: SubscriptionGatingMode.AUDIOBOOK,
         minSubscriptionTier: parsedTier,
         chapterSyncTier: null,
      };
   }

   // CHAPTER mode — tiers are set per chapter at creation time
   return {
      subscriptionGatingMode: SubscriptionGatingMode.CHAPTER,
      minSubscriptionTier: null,
      chapterSyncTier: null,
   };
}

export function assertChapterTierAllowed(
   audiobookMode: SubscriptionGatingMode,
   chapterTier: SubscriptionTierLevel | null | undefined,
): void {
   if (chapterTier === undefined || chapterTier === null) {
      return;
   }
   if (audiobookMode !== SubscriptionGatingMode.CHAPTER) {
      throw ApiError.validationError(
         MessageHandler.getErrorMessage('validation.chapter_tier_not_allowed'),
      );
   }
}

export async function syncChapterTiersForAudiobook(
   tx: Prisma.TransactionClient,
   audiobookId: string,
   gating: ResolvedAudiobookGating,
): Promise<void> {
   if (gating.subscriptionGatingMode === SubscriptionGatingMode.NONE) {
      await tx.chapter.updateMany({
         where: { audiobookId },
         data: { minSubscriptionTier: null },
      });
      return;
   }

   if (gating.subscriptionGatingMode === SubscriptionGatingMode.AUDIOBOOK) {
      const tier = gating.minSubscriptionTier;
      if (tier === null) {
         throw ApiError.validationError(
            MessageHandler.getErrorMessage('validation.subscription_gating_tier_required'),
         );
      }
      await tx.chapter.updateMany({
         where: { audiobookId },
         data: { minSubscriptionTier: tier },
      });
      return;
   }

   // CHAPTER mode — preserve per-chapter tiers
}

export async function resolveChapterTierForCreate(
   prisma: PrismaClient | Prisma.TransactionClient,
   audiobookId: string,
   chapterNumber: number,
   requestedTier: SubscriptionTierLevel | null | undefined,
): Promise<SubscriptionTierLevel | null> {
   const audiobook = await prisma.audioBook.findUnique({
      where: { id: audiobookId },
      select: { subscriptionGatingMode: true, minSubscriptionTier: true },
   });
   if (!audiobook) {
      throw ApiError.notFound(MessageHandler.getErrorMessage('not_found.audiobook'));
   }

   if (audiobook.subscriptionGatingMode === SubscriptionGatingMode.NONE) {
      assertChapterTierAllowed(audiobook.subscriptionGatingMode, requestedTier);
      return null;
   }

   if (audiobook.subscriptionGatingMode === SubscriptionGatingMode.AUDIOBOOK) {
      assertChapterTierAllowed(audiobook.subscriptionGatingMode, requestedTier);
      if (audiobook.minSubscriptionTier === null) {
         throw ApiError.validationError(
            MessageHandler.getErrorMessage('validation.subscription_gating_tier_required'),
         );
      }
      return audiobook.minSubscriptionTier;
   }

   // CHAPTER mode
   if (chapterNumber === 1) {
      if (requestedTier !== undefined && requestedTier !== null) {
         const parsedFirstChapterTier = validateMinSubscriptionTierValue(requestedTier);
         if (parsedFirstChapterTier !== null) {
            throw ApiError.validationError(
               MessageHandler.getErrorMessage('validation.chapter_first_must_be_free'),
            );
         }
      }

      await validateChapterTierSequenceForAudiobook(
         prisma,
         audiobookId,
         { chapterNumber, minSubscriptionTier: null },
      );
      return null;
   }

   // CHAPTER mode — explicit tier required for chapters after the first
   if (requestedTier === undefined) {
      throw ApiError.validationError(
         MessageHandler.getErrorMessage('validation.chapter_tier_required'),
      );
   }

   const tier = validateMinSubscriptionTierValue(requestedTier);
   await validateChapterTierSequenceForAudiobook(
      prisma,
      audiobookId,
      { chapterNumber, minSubscriptionTier: tier },
   );
   return tier;
}

export async function resolveChapterTierForUpdate(
   prisma: PrismaClient | Prisma.TransactionClient,
   audiobookId: string,
   chapterId: string,
   existing: { chapterNumber: number; minSubscriptionTier: SubscriptionTierLevel | null },
   update: {
      chapterNumber?: number;
      minSubscriptionTier?: SubscriptionTierLevel | null | undefined;
   },
): Promise<{ minSubscriptionTier?: SubscriptionTierLevel | null; chapterNumber?: number }> {
   const audiobook = await prisma.audioBook.findUnique({
      where: { id: audiobookId },
      select: { subscriptionGatingMode: true },
   });
   if (!audiobook) {
      throw ApiError.notFound(MessageHandler.getErrorMessage('not_found.audiobook'));
   }

   const nextChapterNumber = update.chapterNumber ?? existing.chapterNumber;
   const tierProvided = update.minSubscriptionTier !== undefined;
   const nextTier = tierProvided
      ? validateMinSubscriptionTierValue(update.minSubscriptionTier)
      : existing.minSubscriptionTier;

   if (audiobook.subscriptionGatingMode === SubscriptionGatingMode.AUDIOBOOK) {
      if (tierProvided) {
         throw ApiError.validationError(
            MessageHandler.getErrorMessage('validation.chapter_tier_not_allowed'),
         );
      }
      return {};
   }

   if (audiobook.subscriptionGatingMode === SubscriptionGatingMode.NONE) {
      if (tierProvided) {
         throw ApiError.validationError(
            MessageHandler.getErrorMessage('validation.chapter_tier_not_allowed'),
         );
      }
      return {};
   }

   // CHAPTER mode
   const chapterNumberChanged = nextChapterNumber !== existing.chapterNumber;
   const tierChanged = tierProvided && nextTier !== existing.minSubscriptionTier;

   if (!chapterNumberChanged && !tierChanged) {
      return {};
   }

   await validateChapterTierSequenceForAudiobook(
      prisma,
      audiobookId,
      {
         id: chapterId,
         chapterNumber: nextChapterNumber,
         minSubscriptionTier: nextTier,
      },
      existing.minSubscriptionTier,
   );

   const result: { minSubscriptionTier?: SubscriptionTierLevel | null; chapterNumber?: number } = {};
   if (tierChanged) {
      result.minSubscriptionTier = nextTier;
   }
   if (chapterNumberChanged) {
      result.chapterNumber = nextChapterNumber;
   }
   return result;
}
