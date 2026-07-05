/**
 * Bookmark and Note Data Transfer Objects
 * Defines the structure for bookmark and note functionality
 */
import { Bookmark as PrismaBookmark } from '@prisma/client';

// --- Bookmark types (chapter-only) ---

export interface BookmarkChapterSummary {
   id: string;
   title: string;
   chapterNumber: number;
   audiobookId: string;
}

export interface BookmarkData {
   id: string;
   userId: string;
   chapterId: string;
   createdAt: Date;
   updatedAt: Date;
}

export interface BookmarkWithRelations extends BookmarkData {
   chapter?: BookmarkChapterSummary;
}

export interface CreateBookmarkRequest {
   chapterId: string;
}

export interface BookmarkQueryParams {
   audiobookId?: string;
   chapterId?: string;
   page?: number;
   limit?: number;
   sortBy?: 'createdAt' | 'updatedAt';
   sortOrder?: 'asc' | 'desc';
}

type BookmarkWithChapter = PrismaBookmark & {
   chapter?: BookmarkChapterSummary;
};

export const bookmarkChapterInclude = {
   chapter: {
      select: {
         id: true,
         title: true,
         chapterNumber: true,
         audiobookId: true,
      },
   },
} as const;

export function toBookmarkDto(bookmark: BookmarkWithChapter): BookmarkWithRelations {
   const dto: BookmarkWithRelations = {
      id: bookmark.id,
      userId: bookmark.userId,
      chapterId: bookmark.chapterId,
      createdAt: bookmark.createdAt,
      updatedAt: bookmark.updatedAt,
   };

   if (bookmark.chapter) {
      dto.chapter = bookmark.chapter;
   }

   return dto;
}

// --- Note types (unchanged) ---

export interface NoteData {
   id: string;
   userId: string;
   audiobookId?: string;
   chapterId?: string;
   title?: string;
   content: string;
   position?: number;
   timestamp: Date;
   createdAt: Date;
   updatedAt: Date;
}

export interface NoteWithRelations extends NoteData {
   audiobook?: {
      id: string;
      title: string;
      author: string;
   };
   chapter?: {
      id: string;
      title: string;
      chapterNumber: number;
   };
}

export interface CreateNoteRequest {
   audiobookId?: string;
   chapterId?: string;
   title?: string;
   content: string;
   position?: number;
}

export interface UpdateNoteRequest {
   title?: string;
   content?: string;
   position?: number;
}

export interface BookmarkNoteQueryParams {
   audiobookId?: string;
   chapterId?: string;
   page?: number;
   limit?: number;
   sortBy?: 'createdAt' | 'updatedAt' | 'timestamp' | 'position' | 'title';
   sortOrder?: 'asc' | 'desc';
   search?: string;
}

export interface BookmarkNoteResponse {
   bookmarks: BookmarkWithRelations[];
   notes: NoteWithRelations[];
   totalBookmarks: number;
   totalNotes: number;
}

export interface BookmarkNoteStats {
   totalBookmarks: number;
   totalNotes: number;
   bookmarksByAudiobook: Array<{
      audiobookId: string;
      audiobookTitle: string;
      count: number;
   }>;
   notesByAudiobook: Array<{
      audiobookId: string;
      audiobookTitle: string;
      count: number;
   }>;
}
