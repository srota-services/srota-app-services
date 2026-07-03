/**
 * AudioBook DTO (Data Transfer Object) classes
 * Provides type-safe data structures for API communication
 */
import { AudioBook as PrismaAudioBook, AudioBookOwnerType as PrismaAudioBookOwnerType, AudiobookType as PrismaAudiobookType, SubscriptionGatingMode, SubscriptionTierLevel } from '@prisma/client';
import { SubscriptionAccessDto } from './SubscriptionAccessDto';
import { LanguageDto, toLanguageDto } from './LanguageDto';
import type { MoodSummaryDto } from './MoodDto';
import { toMoodSummaryDto } from './MoodDto';
import { AudiobookTypeDto } from '../utils/audiobookTypeValidation';

export type { SubscriptionAccessDto };
/** @deprecated Use SubscriptionAccessDto */
export type AudiobookSubscriptionAccessDto = SubscriptionAccessDto;

export type SubscriptionGatingModeDto = 'NONE' | 'AUDIOBOOK' | 'CHAPTER';

export type AudioBookOwnerType = 'AUTHOR' | 'ORGANIZATION';

export interface AudioBookOwnerInput {
  type: AudioBookOwnerType;
  id: string;
}

export interface AudioBookOwnerAuthorDetails {
  id: string;
  slug: string;
  userId: string;
  firstName?: string | null;
  lastName?: string | null;
  avatar?: string | null;
  imageAssets?: Record<string, string>;
}

export interface AudioBookOwnerOrganizationDetails {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  image?: string | null;
  imageAssets?: Record<string, string>;
  preferredGenre?: string | null;
  websiteUrl?: string | null;
  teamSize?: string | null;
}

export interface AudioBookOwnerDto {
  type: AudioBookOwnerType;
  id: string;
  author?: AudioBookOwnerAuthorDetails;
  organization?: AudioBookOwnerOrganizationDetails;
}

export interface SharedAudioBookDto {
  id: string;
  title: string;
  author: string;
  type: AudiobookTypeDto;
  narrator?: string | undefined;
  description?: string | undefined;
  duration?: number | undefined;
  fileSize?: number | undefined;
  coverImage?: string | undefined;
  imageAssets?: Record<string, string>;
  languageId: string;
  language?: LanguageDto;
  publisher?: string | undefined;
  publishDate?: Date | undefined;
  isbn?: string | undefined;
  isActive: boolean;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  scheduledAt?: Date | undefined;
  owner: AudioBookOwnerDto;
  subscriptionAccess?: AudiobookSubscriptionAccessDto;
  rating?: number | null;
  chapterCount?: number;
}

export interface PublicationAudiobookDto extends SharedAudioBookDto {
  type: 'PUBLICATION';
  moodId?: string | null;
  mood?: MoodSummaryDto;
  subscriptionGatingMode: SubscriptionGatingModeDto;
  minSubscriptionTier?: SubscriptionTierLevel | null | undefined;
  audiobookTags?: AudioBookTagDto[] | undefined;
  genres?: GenreDto[] | undefined;
}

export interface AuthoringAudiobookDto extends SharedAudioBookDto {
  type: 'AUTHORING';
}

export type AudioBookDto = PublicationAudiobookDto | AuthoringAudiobookDto;

export interface AudioBookTagDto {
  name: string;
}

export interface GenreDto {
  name: string;
}

export interface CreateAudioBookDto {
  title: string;
  author: string;
  owner: AudioBookOwnerInput;
  type?: AudiobookTypeDto;
  narrator?: string;
  description?: string;
  duration?: number;
  fileSize?: number;
  coverImage?: string;
  genreIds?: string[];
  languageId?: string;
  publisher?: string;
  publishDate?: Date;
  isbn?: string;
  isActive?: boolean;
  isPublic?: boolean;
  subscriptionGatingMode?: SubscriptionGatingModeDto;
  minSubscriptionTier?: SubscriptionTierLevel | null;
  scheduledAt?: Date;
  moodId?: string | null;
}

export interface UpdateAudioBookDto {
  title?: string;
  author?: string;
  owner?: AudioBookOwnerInput;
  narrator?: string;
  description?: string;
  duration?: number;
  fileSize?: number;
  coverImage?: string;
  genreIds?: string[];
  languageId?: string;
  publisher?: string;
  publishDate?: Date;
  isbn?: string;
  isActive?: boolean;
  isPublic?: boolean;
  subscriptionGatingMode?: SubscriptionGatingModeDto;
  minSubscriptionTier?: SubscriptionTierLevel | null;
  scheduledAt?: Date;
  moodId?: string | null;
}

export interface AudioBookQueryParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  type?: AudiobookTypeDto | undefined;
  genreIds?: string[] | undefined;
  moodIds?: string[] | undefined;
  ownerType?: AudioBookOwnerType | undefined;
  ownerId?: string | undefined;
  /** Optional filter: restrict to these owner IDs (same ownerType). */
  ownerIds?: string[] | undefined;
  languageIds?: string[] | undefined;
  author?: string | undefined;
  narrator?: string | undefined;
  isActive?: boolean | undefined;
  isPublic?: boolean | undefined;
  search?: string | undefined;
  active?: boolean | undefined;
  scheduled?: boolean | undefined;
}

export function toPrismaOwnerType(type: AudioBookOwnerType): PrismaAudioBookOwnerType {
  return type as PrismaAudioBookOwnerType;
}

export function fromPrismaOwnerType(type: PrismaAudioBookOwnerType): AudioBookOwnerType {
  return type as AudioBookOwnerType;
}

export function toOwnerDto(
  ownerType: PrismaAudioBookOwnerType,
  ownerId: string,
): AudioBookOwnerDto {
  return {
    type: fromPrismaOwnerType(ownerType),
    id: ownerId,
  };
}

export function toSubscriptionGatingModeDto(mode: SubscriptionGatingMode): SubscriptionGatingModeDto {
  return mode as SubscriptionGatingModeDto;
}

function toAudiobookTypeDto(type: PrismaAudiobookType): AudiobookTypeDto {
  return type as AudiobookTypeDto;
}

function buildSharedAudioBookDto(audiobook: PrismaAudioBook & {
  language?: { id: string; name: string; code: string; createdAt: Date; updatedAt: Date };
}): SharedAudioBookDto {
  return {
    id: audiobook.id,
    title: audiobook.title,
    author: audiobook.author,
    type: toAudiobookTypeDto(audiobook.type),
    narrator: audiobook.narrator || undefined,
    description: audiobook.description || undefined,
    duration: audiobook.duration ?? undefined,
    fileSize: audiobook.fileSize ? Number(audiobook.fileSize) : undefined,
    coverImage: audiobook.coverImage || undefined,
    languageId: audiobook.languageId,
    ...(audiobook.language ? { language: toLanguageDto(audiobook.language) } : {}),
    publisher: audiobook.publisher || undefined,
    publishDate: audiobook.publishDate || undefined,
    isbn: audiobook.isbn || undefined,
    isActive: audiobook.isActive,
    isPublic: audiobook.isPublic,
    createdAt: audiobook.createdAt,
    updatedAt: audiobook.updatedAt,
    scheduledAt: audiobook.scheduledAt || undefined,
    owner: toOwnerDto(audiobook.ownerType, audiobook.ownerId),
  };
}

/**
 * Convert Prisma AudioBook to DTO (owner details hydrated separately).
 * Branches on STI type — authoring responses exclude publication-only metadata.
 */
export function toAudioBookDto(audiobook: PrismaAudioBook & {
  language?: { id: string; name: string; code: string; createdAt: Date; updatedAt: Date };
  mood?: { id: string; name: string; description: string | null; purpose: string; descriptionIcon: string; hexcode: string; icon: string; createdAt: Date; updatedAt: Date } | null;
  audiobookTags?: Array<{ id: string; audiobookId: string; tagId: string; createdAt: Date; tag: { id: string; name: string; createdAt: Date; updatedAt: Date } }>;
  audioBookGenres?: Array<{ id: string; audiobookId: string; genreId: string; createdAt: Date; genre: { id: string; name: string; createdAt: Date; updatedAt: Date } }>;
}): AudioBookDto {
  const shared = buildSharedAudioBookDto(audiobook);

  if (audiobook.type === PrismaAudiobookType.AUTHORING) {
    return {
      ...shared,
      type: 'AUTHORING',
    };
  }

  return {
    ...shared,
    type: 'PUBLICATION',
    moodId: audiobook.moodId ?? null,
    ...(audiobook.mood ? { mood: toMoodSummaryDto(audiobook.mood) } : {}),
    subscriptionGatingMode: toSubscriptionGatingModeDto(
      (audiobook as PrismaAudioBook & { subscriptionGatingMode?: SubscriptionGatingMode }).subscriptionGatingMode
        ?? SubscriptionGatingMode.NONE,
    ),
    minSubscriptionTier: (audiobook as PrismaAudioBook & { minSubscriptionTier?: SubscriptionTierLevel | null }).minSubscriptionTier ?? null,
    audiobookTags: audiobook.audiobookTags?.map(tag => ({
      name: tag.tag.name
    })) || undefined,
    genres: audiobook.audioBookGenres?.map(abg => ({
      name: abg.genre.name
    })) || undefined,
  };
}
