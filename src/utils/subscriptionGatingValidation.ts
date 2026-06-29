import { Prisma, PrismaClient, SubscriptionGatingMode, SubscriptionTierLevel } from '@prisma/client';
import { ApiError } from '../types/ApiError';
import { MessageHandler } from './MessageHandler';
import { ALL_TIER_LEVELS, TIER_NUMERIC_ALIAS } from '../constants/subscriptionTierLevel';

export type SubscriptionGatingModeInput = SubscriptionGatingMode | 'NONE' | 'AUDIOBOOK' | 'CHAPTER';

export interface AudiobookGatingInput {
   subscriptionGatingMode?: SubscriptionGatingModeInput;
   minSubscriptionTier?: SubscriptionTierLevel | null;
}

export interface ResolvedAudiobookGating {
   subscriptionGatingMode: SubscriptionGatingMode;
   /** Value stored on the audiobook row. */
   minSubscriptionTier: SubscriptionTierLevel | null;
   /** Tier applied to all chapters when mode is CHAPTER; null otherwise. */
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

/**
 * Validate a raw value is a valid SubscriptionTierLevel (or null).
 * Accepts enum name strings ("BASE", "STANDARD", "PREMIUM") and null.
 */
export function validateMinSubscriptionTierValue(
   value: SubscriptionTierLevel | string | null | undefined,
): SubscriptionTierLevel | null {
   if (value === null || value === undefined) {
      return null;
   }
   if (ALL_TIER_LEVELS.includes(value as SubscriptionTierLevel)) {
      return value as SubscriptionTierLevel;
   }
   throw ApiError.validationError(
      MessageHandler.getErrorMessage('validation.min_subscription_tier_invalid'),
   );
}

/**
 * Parse minSubscriptionTier from multipart/form-data (strings) or JSON bodies.
 * Accepts:
 *   - undefined → undefined (field not provided)
 *   - null | "" | "null" → null (remove gating)
 *   - "BASE" | "STANDARD" | "PREMIUM" → corresponding enum value
 *   - "1" | "2" | "3" → numeric aliases for backward-compatible API
 */
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
   // Numeric alias: "1" → BASE, "2" → STANDARD, "3" → PREMIUM
   if (TIER_NUMERIC_ALIAS[str]) {
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

export async function getUniformChapterTier(
   prisma: PrismaClient | Prisma.TransactionClient,
   audiobookId: string,
): Promise<SubscriptionTierLevel | null> {
   const chapters = await prisma.chapter.findMany({
      where: { audiobookId },
      select: { minSubscriptionTier: true },
   });
   const tiers = chapters
      .map((c) => c.minSubscriptionTier)
      .filter((t): t is SubscriptionTierLevel => t !== null);
   if (tiers.length === 0) {
      return null;
   }
   const first = tiers[0]!;
   if (tiers.some((t) => t !== first)) {
      throw ApiError.validationError(
         MessageHandler.getErrorMessage('validation.chapter_tier_mismatch'),
      );
   }
   return first;
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
   const parsedTier =
      input.minSubscriptionTier !== undefined
         ? validateMinSubscriptionTierValue(input.minSubscriptionTier)
         : undefined;

   let mode = parsedMode ?? existing.subscriptionGatingMode;

   // Legacy: tier without explicit mode implies AUDIOBOOK
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
         tier = await getUniformChapterTier(prisma, audiobookId);
      }
      if (tier === null) {
         throw ApiError.validationError(
            MessageHandler.getErrorMessage('validation.subscription_gating_tier_required'),
         );
      }
      return {
         subscriptionGatingMode: SubscriptionGatingMode.AUDIOBOOK,
         minSubscriptionTier: tier,
         chapterSyncTier: null,
      };
   }

   // CHAPTER mode
   let chapterSyncTier = parsedTier ?? null;
   if (chapterSyncTier === null && existing.subscriptionGatingMode === SubscriptionGatingMode.AUDIOBOOK) {
      chapterSyncTier = existing.minSubscriptionTier;
   }
   if (chapterSyncTier === null) {
      chapterSyncTier = await getUniformChapterTier(prisma, audiobookId);
   }
   if (chapterSyncTier === null) {
      throw ApiError.validationError(
         MessageHandler.getErrorMessage('validation.subscription_gating_tier_required'),
      );
   }

   return {
      subscriptionGatingMode: SubscriptionGatingMode.CHAPTER,
      minSubscriptionTier: null,
      chapterSyncTier,
   };
}

export function resolveAudiobookGatingCreate(input: AudiobookGatingInput): ResolvedAudiobookGating {
   const parsedMode =
      input.subscriptionGatingMode !== undefined
         ? parseSubscriptionGatingMode(input.subscriptionGatingMode)
         : undefined;
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

   if (parsedTier === null || parsedTier === undefined) {
      throw ApiError.validationError(
         MessageHandler.getErrorMessage('validation.subscription_gating_tier_required'),
      );
   }

   return {
      subscriptionGatingMode: SubscriptionGatingMode.CHAPTER,
      minSubscriptionTier: null,
      chapterSyncTier: parsedTier,
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

export async function assertChapterTierMatchesSiblings(
   prisma: PrismaClient | Prisma.TransactionClient,
   audiobookId: string,
   chapterTier: SubscriptionTierLevel | null,
   excludeChapterId?: string,
): Promise<void> {
   if (chapterTier === null) {
      return;
   }

   const siblings = await prisma.chapter.findMany({
      where: {
         audiobookId,
         ...(excludeChapterId ? { id: { not: excludeChapterId } } : {}),
      },
      select: { minSubscriptionTier: true },
   });

   for (const sibling of siblings) {
      if (sibling.minSubscriptionTier !== null && sibling.minSubscriptionTier !== chapterTier) {
         throw ApiError.validationError(
            MessageHandler.getErrorMessage('validation.chapter_tier_mismatch'),
         );
      }
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
      await tx.chapter.updateMany({
         where: { audiobookId },
         data: { minSubscriptionTier: null },
      });
      return;
   }

   const tier = gating.chapterSyncTier;
   if (tier === null) {
      throw ApiError.validationError(
         MessageHandler.getErrorMessage('validation.subscription_gating_tier_required'),
      );
   }

   await tx.chapter.updateMany({
      where: { audiobookId },
      data: { minSubscriptionTier: tier },
   });
}

export async function resolveChapterTierForCreate(
   prisma: PrismaClient | Prisma.TransactionClient,
   audiobookId: string,
   requestedTier: SubscriptionTierLevel | null | undefined,
): Promise<SubscriptionTierLevel | null> {
   const audiobook = await prisma.audioBook.findUnique({
      where: { id: audiobookId },
      select: { subscriptionGatingMode: true },
   });
   if (!audiobook) {
      throw ApiError.notFound(MessageHandler.getErrorMessage('not_found.audiobook'));
   }

   if (audiobook.subscriptionGatingMode !== SubscriptionGatingMode.CHAPTER) {
      assertChapterTierAllowed(audiobook.subscriptionGatingMode, requestedTier);
      return null;
   }

   const tier =
      requestedTier !== undefined
         ? validateMinSubscriptionTierValue(requestedTier)
         : null;

   if (tier !== null) {
      await assertChapterTierMatchesSiblings(prisma, audiobookId, tier);
      return tier;
   }

   const sibling = await prisma.chapter.findFirst({
      where: { audiobookId, minSubscriptionTier: { not: null } },
      select: { minSubscriptionTier: true },
   });

   if (sibling?.minSubscriptionTier !== undefined && sibling.minSubscriptionTier !== null) {
      return sibling.minSubscriptionTier;
   }

   const chapterCount = await prisma.chapter.count({ where: { audiobookId } });
   if (chapterCount === 0) {
      throw ApiError.validationError(
         MessageHandler.getErrorMessage('validation.subscription_gating_tier_required'),
      );
   }

   return null;
}

export async function resolveChapterTierForUpdate(
   prisma: PrismaClient | Prisma.TransactionClient,
   audiobookId: string,
   chapterId: string,
   requestedTier: SubscriptionTierLevel | null | undefined,
): Promise<SubscriptionTierLevel | null | undefined> {
   if (requestedTier === undefined) {
      return undefined;
   }

   const audiobook = await prisma.audioBook.findUnique({
      where: { id: audiobookId },
      select: { subscriptionGatingMode: true },
   });
   if (!audiobook) {
      throw ApiError.notFound(MessageHandler.getErrorMessage('not_found.audiobook'));
   }

   assertChapterTierAllowed(audiobook.subscriptionGatingMode, requestedTier);
   const tier = validateMinSubscriptionTierValue(requestedTier);
   await assertChapterTierMatchesSiblings(prisma, audiobookId, tier, chapterId);

   if (audiobook.subscriptionGatingMode === SubscriptionGatingMode.CHAPTER && tier !== null) {
      await prisma.chapter.updateMany({
         where: { audiobookId },
         data: { minSubscriptionTier: tier },
      });
   }

   return tier;
}
