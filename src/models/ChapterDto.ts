/**
 * Chapter Data Transfer Objects
 * Defines the structure for chapter-related data transfer
 */

import { ChapterProgress, Bookmark, Note, SubscriptionTierLevel } from '@prisma/client';
import { SubscriptionAccessDto } from './SubscriptionAccessDto';
import { PageData } from './PageDto';

// Base Chapter interface
export interface ChapterData {
   id: string;
   audiobookId: string;
   title: string;
   description?: string;
   chapterNumber: number;
   duration?: number | null;
   filePath?: string | null;
   fileSize?: number | null;
   coverImage: string;
   imageAssets?: Record<string, string>;
   startPosition?: number | null;
   endPosition?: number | null;
   minSubscriptionTier?: SubscriptionTierLevel | null;
   isActive: boolean;
   transcodingReady?: boolean;
   sourceUploadStatus?: 'pending' | 'ready' | 'failed';
   sourceUploadError?: string | null;
   createdAt: Date;
   updatedAt: Date;
   scheduledAt?: Date | null;
   pages?: PageData[];
}

// Chapter with relations
export interface ChapterWithRelations extends ChapterData {
   subscriptionAccess?: SubscriptionAccessDto;
   audiobook?: {
      id: string;
      title: string;
      author: string;
   };
   chapterProgress?: ChapterProgress[];
   bookmarks?: Bookmark[];
   notes?: Note[];
}

import { CreatePageInput } from './PageDto';

// Chapter creation request
export interface CreateChapterRequest {
   audiobookId: string;
   title: string;
   description?: string;
   chapterNumber: number;
   duration?: number;
   filePath?: string;
   fileSize?: number;
   coverImage?: string;
   startPosition?: number;
   endPosition?: number;
   minSubscriptionTier?: SubscriptionTierLevel | null;
   scheduledAt?: Date;
   pages?: CreatePageInput[];
}

// Chapter update request
export interface UpdateChapterRequest {
   title?: string;
   description?: string;
   chapterNumber?: number;
   duration?: number;
   filePath?: string;
   fileSize?: number;
   coverImage?: string;
   startPosition?: number;
   endPosition?: number;
   isActive?: boolean;
   minSubscriptionTier?: SubscriptionTierLevel | null;
   scheduledAt?: Date;
}

// Chapter progress tracking
export interface ChapterProgressData {
   id: string;
   userProfileId: string;
   chapterId: string;
   currentPosition: number;
   completed: boolean;
   lastListenedAt: Date;
   createdAt: Date;
   updatedAt: Date;
}

// Chapter progress update request
export interface UpdateChapterProgressRequest {
   currentPosition: number;
   completed?: boolean;
}

// Chapter query parameters
export interface ChapterQueryParams {
   audiobookId?: string;
   page?: number;
   limit?: number;
   sortBy?: string;
   sortOrder?: 'asc' | 'desc';
   activeOnly?: boolean;
}

// Chapter response with progress
export interface ChapterWithProgress extends ChapterData {
   userProgress?: ChapterProgressData;
   overallProgress?: number; // Percentage completed
}

// Chapter navigation data
export interface ChapterNavigation {
   currentChapter: ChapterWithProgress;
   previousChapter?: ChapterWithProgress;
   nextChapter?: ChapterWithProgress;
   totalChapters: number;
   currentChapterIndex: number;
}
