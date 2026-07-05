/**
 * Bookmark Service
 * Handles bookmark and note management functionality
 */
import { Prisma, PrismaClient } from '@prisma/client';
import {
   BookmarkWithRelations,
   CreateBookmarkRequest,
   NoteData,
   NoteWithRelations,
   CreateNoteRequest,
   UpdateNoteRequest,
   BookmarkNoteQueryParams,
   BookmarkNoteResponse,
   BookmarkNoteStats,
   BookmarkQueryParams,
   bookmarkChapterInclude,
   toBookmarkDto,
} from '../models/BookmarkNoteDto';
import { ApiError } from '../types/ApiError';
import { MessageHandler } from '../utils/MessageHandler';
import { HttpStatusCode, ErrorType } from '../types/common';
import { emitCacheInvalidation } from './DomainEventPublisher';
import { runWrite } from '../utils/prismaTransaction';
import { rethrowServiceError } from '../utils/serviceError';

const BOOKMARK_SORT_FIELDS: BookmarkQueryParams['sortBy'][] = ['createdAt', 'updatedAt'];

export class BookmarkService {
   constructor(private prisma: PrismaClient) { }

   /**
    * Create a chapter bookmark for the authenticated user
    */
   async createBookmark(userId: string, bookmarkData: CreateBookmarkRequest): Promise<BookmarkWithRelations> {
      const chapter = await this.prisma.chapter.findUnique({
         where: { id: bookmarkData.chapterId },
      });
      if (!chapter) {
         throw new ApiError(
            MessageHandler.getErrorMessage('bookmarks.chapter_not_found'),
            HttpStatusCode.NOT_FOUND,
            ErrorType.NOT_FOUND
         );
      }

      const existing = await this.prisma.bookmark.findUnique({
         where: {
            userId_chapterId: {
               userId,
               chapterId: bookmarkData.chapterId,
            },
         },
      });
      if (existing) {
         throw new ApiError(
            MessageHandler.getErrorMessage('bookmarks.already_exists'),
            HttpStatusCode.CONFLICT,
            ErrorType.CONFLICT
         );
      }

      try {
         const bookmark = await runWrite(this.prisma, async (tx) =>
            tx.bookmark.create({
               data: {
                  userId,
                  chapterId: bookmarkData.chapterId,
               },
               include: bookmarkChapterInclude,
            }),
         );

         emitCacheInvalidation('bookmark', 'created', bookmark.id, {
            audiobookId: chapter.audiobookId,
         });
         return toBookmarkDto(bookmark);
      } catch (error) {
         if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            throw new ApiError(
               MessageHandler.getErrorMessage('bookmarks.already_exists'),
               HttpStatusCode.CONFLICT,
               ErrorType.CONFLICT
            );
         }
         throw new ApiError(
            MessageHandler.getErrorMessage('bookmarks.create_failed'),
            HttpStatusCode.INTERNAL_SERVER_ERROR,
            ErrorType.INTERNAL_ERROR
         );
      }
   }

   /**
    * Get bookmarks for a user
    */
   async getBookmarks(userId: string, queryParams?: BookmarkQueryParams): Promise<{
      bookmarks: BookmarkWithRelations[];
      totalCount: number;
   }> {
      try {
         const {
            audiobookId,
            chapterId,
            page = 1,
            limit = 20,
            sortBy = 'createdAt',
            sortOrder = 'desc',
         } = queryParams || {};

         const skip = (page - 1) * limit;
         const whereClause: Prisma.BookmarkWhereInput = { userId };

         if (audiobookId) {
            whereClause.chapter = { audiobookId };
         }
         if (chapterId) {
            whereClause.chapterId = chapterId;
         }

         const orderField = BOOKMARK_SORT_FIELDS.includes(sortBy) ? sortBy : 'createdAt';

         const [bookmarks, totalCount] = await Promise.all([
            this.prisma.bookmark.findMany({
               where: whereClause,
               include: bookmarkChapterInclude,
               orderBy: { [orderField]: sortOrder },
               skip,
               take: limit,
            }),
            this.prisma.bookmark.count({
               where: whereClause,
            }),
         ]);

         return {
            bookmarks: bookmarks.map(toBookmarkDto),
            totalCount,
         };
      } catch (error) {
         rethrowServiceError(error, { operation: 'getBookmarks' }, MessageHandler.getErrorMessage('bookmarks.fetch_failed'));
      }
   }

   /**
    * Get a specific bookmark by ID
    */
   async getBookmarkById(userId: string, bookmarkId: string): Promise<BookmarkWithRelations> {
      try {
         const bookmark = await this.prisma.bookmark.findFirst({
            where: {
               id: bookmarkId,
               userId,
            },
            include: bookmarkChapterInclude,
         });

         if (!bookmark) {
            throw new ApiError(
               MessageHandler.getErrorMessage('bookmarks.not_found'),
               HttpStatusCode.NOT_FOUND,
               ErrorType.NOT_FOUND
            );
         }

         return toBookmarkDto(bookmark);
      } catch (error) {
         if (error instanceof ApiError) {
            throw error;
         }
         throw new ApiError(
            MessageHandler.getErrorMessage('bookmarks.fetch_failed'),
            HttpStatusCode.INTERNAL_SERVER_ERROR,
            ErrorType.INTERNAL_ERROR
         );
      }
   }

   /**
    * Delete a bookmark
    */
   async deleteBookmark(userId: string, bookmarkId: string): Promise<void> {
      try {
         const bookmark = await this.prisma.bookmark.findFirst({
            where: {
               id: bookmarkId,
               userId,
            },
            include: { chapter: { select: { audiobookId: true } } },
         });

         if (!bookmark) {
            throw new ApiError(
               MessageHandler.getErrorMessage('bookmarks.not_found'),
               HttpStatusCode.NOT_FOUND,
               ErrorType.NOT_FOUND
            );
         }

         await runWrite(this.prisma, async (tx) =>
            tx.bookmark.delete({
               where: { id: bookmarkId },
            }),
         );
         emitCacheInvalidation('bookmark', 'deleted', bookmarkId, {
            audiobookId: bookmark.chapter.audiobookId,
         });
      } catch (error) {
         if (error instanceof ApiError) {
            throw error;
         }
         throw new ApiError(
            MessageHandler.getErrorMessage('bookmarks.delete_failed'),
            HttpStatusCode.INTERNAL_SERVER_ERROR,
            ErrorType.INTERNAL_ERROR
         );
      }
   }

   /**
    * Create a new note
    */
   async createNote(userId: string, noteData: CreateNoteRequest): Promise<NoteData> {
      try {
         if (!noteData.audiobookId && !noteData.chapterId) {
            throw new ApiError('Either audiobookId or chapterId must be provided', 400);
         }

         if (noteData.audiobookId) {
            const audiobook = await this.prisma.audioBook.findUnique({
               where: { id: noteData.audiobookId },
            });
            if (!audiobook) {
               throw new ApiError('Audiobook not found', 404);
            }
         }

         if (noteData.chapterId) {
            const chapter = await this.prisma.chapter.findUnique({
               where: { id: noteData.chapterId },
            });
            if (!chapter) {
               throw new ApiError('Chapter not found', 404);
            }
         }

         const note = await runWrite(this.prisma, async (tx) =>
            tx.note.create({
               data: {
                  userId,
                  ...noteData,
               },
            }),
         );

         emitCacheInvalidation('note', 'created', note.id, {
            ...(note.audiobookId ? { audiobookId: note.audiobookId } : {}),
         });
         return {
            id: note.id,
            userId: note.userId,
            audiobookId: note.audiobookId || undefined,
            chapterId: note.chapterId || undefined,
            title: note.title || undefined,
            content: note.content,
            position: note.position || undefined,
            timestamp: note.timestamp,
            createdAt: note.createdAt,
            updatedAt: note.updatedAt,
         } as NoteData;
      } catch (error) {
         if (error instanceof ApiError) {
            throw error;
         }
         throw new ApiError('Failed to create note', 500);
      }
   }

   /**
    * Get notes for a user
    */
   async getNotes(userId: string, queryParams?: BookmarkNoteQueryParams): Promise<{
      notes: NoteWithRelations[];
      totalCount: number;
   }> {
      try {
         const {
            audiobookId,
            chapterId,
            page = 1,
            limit = 20,
            sortBy = 'createdAt',
            sortOrder = 'desc',
            search,
         } = queryParams || {};

         const skip = (page - 1) * limit;
         const whereClause: Prisma.NoteWhereInput = { userId };

         if (audiobookId) {
            whereClause.audiobookId = audiobookId;
         }
         if (chapterId) {
            whereClause.chapterId = chapterId;
         }
         if (search) {
            whereClause.OR = [
               { title: { contains: search, mode: 'insensitive' } },
               { content: { contains: search, mode: 'insensitive' } },
            ];
         }

         const [notes, totalCount] = await Promise.all([
            this.prisma.note.findMany({
               where: whereClause,
               include: {
                  audiobook: {
                     select: {
                        id: true,
                        title: true,
                        author: true,
                     },
                  },
                  chapter: {
                     select: {
                        id: true,
                        title: true,
                        chapterNumber: true,
                     },
                  },
               },
               orderBy: { [sortBy]: sortOrder },
               skip,
               take: limit,
            }),
            this.prisma.note.count({
               where: whereClause,
            }),
         ]);

         return {
            notes: notes.map(note => ({
               id: note.id,
               userId: note.userId,
               audiobookId: note.audiobookId || undefined,
               chapterId: note.chapterId || undefined,
               title: note.title || undefined,
               content: note.content,
               position: note.position || undefined,
               timestamp: note.timestamp,
               createdAt: note.createdAt,
               updatedAt: note.updatedAt,
            } as NoteWithRelations)),
            totalCount,
         };
      } catch (error) {
         rethrowServiceError(error, { operation: 'getNotes' }, MessageHandler.getErrorMessage('internal.default'));
      }
   }

   /**
    * Get a specific note by ID
    */
   async getNoteById(userId: string, noteId: string): Promise<NoteWithRelations> {
      try {
         const note = await this.prisma.note.findFirst({
            where: {
               id: noteId,
               userId,
            },
            include: {
               audiobook: {
                  select: {
                     id: true,
                     title: true,
                     author: true,
                  },
               },
               chapter: {
                  select: {
                     id: true,
                     title: true,
                     chapterNumber: true,
                  },
               },
            },
         });

         if (!note) {
            throw new ApiError('Note not found', 404);
         }

         return {
            id: note.id,
            userId: note.userId,
            audiobookId: note.audiobookId || undefined,
            chapterId: note.chapterId || undefined,
            title: note.title || undefined,
            content: note.content,
            position: note.position || undefined,
            timestamp: note.timestamp,
            createdAt: note.createdAt,
            updatedAt: note.updatedAt,
         } as NoteWithRelations;
      } catch (error) {
         if (error instanceof ApiError) {
            throw error;
         }
         throw new ApiError('Failed to retrieve note', 500);
      }
   }

   /**
    * Update a note
    */
   async updateNote(userId: string, noteId: string, updateData: UpdateNoteRequest): Promise<NoteData> {
      try {
         const existingNote = await this.prisma.note.findFirst({
            where: {
               id: noteId,
               userId,
            },
         });

         if (!existingNote) {
            throw new ApiError('Note not found', 404);
         }

         const note = await runWrite(this.prisma, async (tx) =>
            tx.note.update({
               where: { id: noteId },
               data: updateData,
            }),
         );

         emitCacheInvalidation('note', 'updated', noteId, {
            ...(note.audiobookId ? { audiobookId: note.audiobookId } : {}),
         });
         return {
            id: note.id,
            userId: note.userId,
            audiobookId: note.audiobookId || undefined,
            chapterId: note.chapterId || undefined,
            title: note.title || undefined,
            content: note.content,
            position: note.position || undefined,
            timestamp: note.timestamp,
            createdAt: note.createdAt,
            updatedAt: note.updatedAt,
         } as NoteData;
      } catch (error) {
         if (error instanceof ApiError) {
            throw error;
         }
         throw new ApiError('Failed to update note', 500);
      }
   }

   /**
    * Delete a note
    */
   async deleteNote(userId: string, noteId: string): Promise<void> {
      try {
         const note = await this.prisma.note.findFirst({
            where: {
               id: noteId,
               userId,
            },
         });

         if (!note) {
            throw new ApiError('Note not found', 404);
         }

         await runWrite(this.prisma, async (tx) =>
            tx.note.delete({
               where: { id: noteId },
            }),
         );
         emitCacheInvalidation('note', 'deleted', noteId, {
            ...(note.audiobookId ? { audiobookId: note.audiobookId } : {}),
         });
      } catch (error) {
         if (error instanceof ApiError) {
            throw error;
         }
         throw new ApiError('Failed to delete note', 500);
      }
   }

   /**
    * Get combined bookmarks and notes for a user
    */
   async getBookmarksAndNotes(userId: string, queryParams?: BookmarkNoteQueryParams): Promise<BookmarkNoteResponse> {
      try {
         const bookmarkParams: BookmarkQueryParams = {
            sortBy: queryParams?.sortBy === 'updatedAt' ? 'updatedAt' : 'createdAt',
         };
         if (queryParams?.audiobookId) bookmarkParams.audiobookId = queryParams.audiobookId;
         if (queryParams?.chapterId) bookmarkParams.chapterId = queryParams.chapterId;
         if (queryParams?.page !== undefined) bookmarkParams.page = queryParams.page;
         if (queryParams?.limit !== undefined) bookmarkParams.limit = queryParams.limit;
         if (queryParams?.sortOrder) bookmarkParams.sortOrder = queryParams.sortOrder;

         const [bookmarksResult, notesResult] = await Promise.all([
            this.getBookmarks(userId, bookmarkParams),
            this.getNotes(userId, queryParams),
         ]);

         return {
            bookmarks: bookmarksResult.bookmarks,
            notes: notesResult.notes,
            totalBookmarks: bookmarksResult.totalCount,
            totalNotes: notesResult.totalCount,
         };
      } catch (error) {
         if (error instanceof ApiError) {
            throw error;
         }
         throw new ApiError('Failed to retrieve bookmarks and notes', 500);
      }
   }

   /**
    * Get bookmark and note statistics for a user
    */
   async getBookmarkNoteStats(userId: string): Promise<BookmarkNoteStats> {
      try {
         const [totalBookmarks, totalNotes, bookmarkRows, notesByAudiobook] = await Promise.all([
            this.prisma.bookmark.count({
               where: { userId },
            }),
            this.prisma.note.count({
               where: { userId },
            }),
            this.prisma.bookmark.findMany({
               where: { userId },
               select: {
                  chapter: {
                     select: { audiobookId: true },
                  },
               },
            }),
            this.prisma.note.groupBy({
               by: ['audiobookId'],
               where: { userId },
               _count: { audiobookId: true },
            }),
         ]);

         const bookmarkCountByAudiobook = new Map<string, number>();
         for (const row of bookmarkRows) {
            const audiobookId = row.chapter.audiobookId;
            bookmarkCountByAudiobook.set(
               audiobookId,
               (bookmarkCountByAudiobook.get(audiobookId) ?? 0) + 1
            );
         }

         const audiobookIds = [
            ...new Set([
               ...bookmarkCountByAudiobook.keys(),
               ...notesByAudiobook.map(n => n.audiobookId).filter((id): id is string => Boolean(id)),
            ]),
         ];

         const audiobooks = await this.prisma.audioBook.findMany({
            where: { id: { in: audiobookIds } },
            select: { id: true, title: true },
         });

         const audiobookMap = new Map(audiobooks.map(ab => [ab.id, ab.title]));

         return {
            totalBookmarks,
            totalNotes,
            bookmarksByAudiobook: [...bookmarkCountByAudiobook.entries()].map(([audiobookId, count]) => ({
               audiobookId,
               audiobookTitle: audiobookMap.get(audiobookId) || 'Unknown',
               count,
            })),
            notesByAudiobook: notesByAudiobook.map(n => ({
               audiobookId: n.audiobookId || '',
               audiobookTitle: audiobookMap.get(n.audiobookId || '') || 'Unknown',
               count: n._count.audiobookId,
            })),
         };
      } catch (error) {
         rethrowServiceError(error, { operation: 'getBookmarkNoteStats' }, MessageHandler.getErrorMessage('internal.default'));
      }
   }
}
