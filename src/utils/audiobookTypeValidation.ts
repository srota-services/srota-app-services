/**
 * STI validation for PublicationAudiobook vs AuthoringAudiobook.
 */
import { AudiobookType } from '@prisma/client';
import { ApiError } from '../types/ApiError';
import { MessageHandler } from './MessageHandler';
import { CreatePageInput } from '../models/PageDto';

export type AudiobookTypeDto = 'PUBLICATION' | 'AUTHORING';

const AUTHORING_FORBIDDEN_AUDIOBOOK_FIELDS = [
  'genreIds',
  'tagIds',
  'moodId',
  'subscriptionGatingMode',
  'minSubscriptionTier',
] as const;

export function parseAudiobookType(value: unknown): AudiobookType {
  if (value === undefined || value === null || value === '') {
    return AudiobookType.PUBLICATION;
  }
  if (value === AudiobookType.PUBLICATION || value === AudiobookType.AUTHORING) {
    return value;
  }
  throw ApiError.validationError(MessageHandler.getErrorMessage('validation.audiobook_type_invalid'));
}

export function isAuthoringType(type: AudiobookType): boolean {
  return type === AudiobookType.AUTHORING;
}

export function isPublicationType(type: AudiobookType): boolean {
  return type === AudiobookType.PUBLICATION;
}

function fieldIsPresent(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === 'string' && value.trim() === '') {
    return false;
  }
  return true;
}

/**
 * Reject publication-only metadata on authoring audiobook create/update payloads.
 */
export function assertAuthoringAudiobookMetadataForbidden(
  payload: Record<string, unknown>,
  context: 'create' | 'update',
): void {
  for (const field of AUTHORING_FORBIDDEN_AUDIOBOOK_FIELDS) {
    if (fieldIsPresent(payload[field])) {
      throw ApiError.validationError(
        MessageHandler.getErrorMessage('validation.authoring_metadata_forbidden'),
      );
    }
  }

    if (context === 'update') {
      if (payload['type'] !== undefined && payload['type'] !== null && payload['type'] !== '') {
        throw ApiError.validationError(MessageHandler.getErrorMessage('validation.audiobook_type_immutable'));
      }
    }
}

export function assertAuthoringChapterTierForbidden(minSubscriptionTier: unknown): void {
  if (minSubscriptionTier !== undefined && minSubscriptionTier !== null) {
    throw ApiError.validationError(
      MessageHandler.getErrorMessage('validation.authoring_chapter_tier_forbidden'),
    );
  }
}

export function assertPublicationChapterRequiresAudio(hasAudio: boolean): void {
  if (!hasAudio) {
    throw ApiError.validationError(MessageHandler.getErrorMessage('validation.publication_chapter_audio_required'));
  }
}

export function assertAuthoringChapterRequiresPages(pages: CreatePageInput[] | undefined): void {
  if (!pages || pages.length === 0) {
    throw ApiError.validationError(MessageHandler.getErrorMessage('validation.authoring_chapter_pages_required'));
  }
}

export function assertPagesForbiddenForPublication(type: AudiobookType): void {
  if (isPublicationType(type)) {
    throw ApiError.validationError(MessageHandler.getErrorMessage('validation.pages_publication_forbidden'));
  }
}

export function assertAuthoringAudiobookRequired(type: AudiobookType): void {
  if (!isAuthoringType(type)) {
    throw ApiError.validationError(MessageHandler.getErrorMessage('validation.pages_authoring_only'));
  }
}

export function validatePageInput(input: CreatePageInput, index?: number): void {
  const label = index !== undefined ? `pages[${index}]` : 'page';

  if (input.pageNumber === undefined || !Number.isInteger(input.pageNumber) || input.pageNumber < 1) {
    throw ApiError.validationError(
      MessageHandler.getErrorMessage('validation.page_number_positive').replace('{label}', label),
    );
  }

  if (!input.plainText || typeof input.plainText !== 'string' || input.plainText.trim().length === 0) {
    throw ApiError.validationError(
      MessageHandler.getErrorMessage('validation.page_plain_text_required').replace('{label}', label),
    );
  }

  if (input.richText === undefined || input.richText === null) {
    throw ApiError.validationError(
      MessageHandler.getErrorMessage('validation.page_rich_text_required').replace('{label}', label),
    );
  }

  const richType = typeof input.richText;
  if (richType !== 'object') {
    throw ApiError.validationError(
      MessageHandler.getErrorMessage('validation.page_rich_text_invalid').replace('{label}', label),
    );
  }

  if (Array.isArray(input.richText)) {
    return;
  }

  if (Object.prototype.toString.call(input.richText) !== '[object Object]') {
    throw ApiError.validationError(
      MessageHandler.getErrorMessage('validation.page_rich_text_invalid').replace('{label}', label),
    );
  }
}

export function validatePageInputs(pages: CreatePageInput[]): void {
  const seen = new Set<number>();
  pages.forEach((page, index) => {
    validatePageInput(page, index);
    if (seen.has(page.pageNumber)) {
      throw ApiError.validationError(MessageHandler.getErrorMessage('validation.page_number_duplicate'));
    }
    seen.add(page.pageNumber);
  });
}

export function parsePagesFromBody(pagesField: unknown): CreatePageInput[] | undefined {
  if (pagesField === undefined || pagesField === null || pagesField === '') {
    return undefined;
  }

  let parsed: unknown = pagesField;
  if (typeof pagesField === 'string') {
    try {
      parsed = JSON.parse(pagesField);
    } catch {
      throw ApiError.validationError(MessageHandler.getErrorMessage('validation.pages_json_invalid'));
    }
  }

  if (!Array.isArray(parsed)) {
    throw ApiError.validationError(MessageHandler.getErrorMessage('validation.pages_array_required'));
  }

  return parsed as CreatePageInput[];
}
