/**
 * BookmarkNoteDto Tests
 * Tests for Bookmark and Note DTO interfaces
 */

import {
   BookmarkData,
   BookmarkWithRelations,
   CreateBookmarkRequest,
   NoteData,
   NoteWithRelations,
   CreateNoteRequest,
   UpdateNoteRequest,
   BookmarkNoteQueryParams,
   BookmarkNoteResponse,
   BookmarkNoteStats,
   toBookmarkDto,
} from '../../models/BookmarkNoteDto';

describe('BookmarkNoteDto', () => {
   const createMockBookmarkData = (overrides = {}): BookmarkData => {
      return {
         id: 'bookmark-id',
         userId: 'user-id',
         chapterId: 'chapter-id',
         createdAt: new Date('2024-01-01'),
         updatedAt: new Date('2024-01-02'),
         ...overrides,
      };
   };

   const createMockBookmarkWithRelations = (overrides = {}): BookmarkWithRelations => {
      const baseBookmark = createMockBookmarkData();
      return {
         ...baseBookmark,
         chapter: {
            id: 'chapter-id',
            title: 'Test Chapter',
            chapterNumber: 1,
            audiobookId: 'audiobook-id',
         },
         ...overrides,
      };
   };

   const createMockNoteData = (overrides = {}): NoteData => {
      return {
         id: 'note-id',
         userId: 'user-id',
         audiobookId: 'audiobook-id',
         chapterId: 'chapter-id',
         title: 'My Note',
         content: 'This is a test note',
         position: 180,
         timestamp: new Date('2024-01-10'),
         createdAt: new Date('2024-01-01'),
         updatedAt: new Date('2024-01-02'),
         ...overrides,
      };
   };

   const createMockNoteWithRelations = (overrides = {}): NoteWithRelations => {
      const baseNote = createMockNoteData();
      return {
         ...baseNote,
         audiobook: {
            id: 'audiobook-id',
            title: 'Test Audiobook',
            author: 'Test Author',
         },
         chapter: {
            id: 'chapter-id',
            title: 'Test Chapter',
            chapterNumber: 1,
         },
         ...overrides,
      };
   };

   describe('BookmarkData', () => {
      it('should create valid chapter-only BookmarkData object', () => {
         const bookmark = createMockBookmarkData();

         expect(bookmark.id).toBe('bookmark-id');
         expect(bookmark.userId).toBe('user-id');
         expect(bookmark.chapterId).toBe('chapter-id');
         expect(bookmark.createdAt).toBeInstanceOf(Date);
         expect(bookmark.updatedAt).toBeInstanceOf(Date);
      });
   });

   describe('BookmarkWithRelations', () => {
      it('should create valid BookmarkWithRelations with chapter', () => {
         const bookmark = createMockBookmarkWithRelations();

         expect(bookmark.chapter).toBeDefined();
         expect(bookmark.chapter?.title).toBe('Test Chapter');
         expect(bookmark.chapter?.audiobookId).toBe('audiobook-id');
      });

      it('should handle optional chapter relation', () => {
         const bookmark = createMockBookmarkWithRelations({
            chapter: undefined,
         });

         expect(bookmark.chapter).toBeUndefined();
      });
   });

   describe('CreateBookmarkRequest', () => {
      it('should require chapterId only', () => {
         const request: CreateBookmarkRequest = {
            chapterId: 'chapter-id',
         };

         expect(request.chapterId).toBe('chapter-id');
      });
   });

   describe('toBookmarkDto', () => {
      it('should map prisma bookmark with chapter', () => {
         const dto = toBookmarkDto({
            id: 'bookmark-id',
            userId: 'user-id',
            chapterId: 'chapter-id',
            createdAt: new Date('2024-01-01'),
            updatedAt: new Date('2024-01-02'),
            chapter: {
               id: 'chapter-id',
               title: 'Chapter 1',
               chapterNumber: 1,
               audiobookId: 'audiobook-id',
            },
         });

         expect(dto.chapter?.title).toBe('Chapter 1');
         expect(dto.chapterId).toBe('chapter-id');
      });
   });

   describe('NoteData', () => {
      it('should create valid NoteData object', () => {
         const note = createMockNoteData();

         expect(note.id).toBe('note-id');
         expect(note.content).toBe('This is a test note');
         expect(note.timestamp).toBeInstanceOf(Date);
      });

      it('should handle optional fields', () => {
         const minimalNote: NoteData = {
            id: 'note-id',
            userId: 'user-id',
            content: 'Required content',
            timestamp: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
         };

         expect(minimalNote.title).toBeUndefined();
         expect(minimalNote.position).toBeUndefined();
      });
   });

   describe('NoteWithRelations', () => {
      it('should create valid NoteWithRelations', () => {
         const note = createMockNoteWithRelations();

         expect(note.audiobook).toBeDefined();
         expect(note.chapter).toBeDefined();
      });
   });

   describe('CreateNoteRequest', () => {
      it('should require content field', () => {
         const request: CreateNoteRequest = {
            content: 'Required content',
         };

         expect(request.content).toBe('Required content');
      });
   });

   describe('UpdateNoteRequest', () => {
      it('should accept partial updates', () => {
         const partialUpdate: UpdateNoteRequest = {
            content: 'Only content updated',
         };

         expect(partialUpdate.content).toBe('Only content updated');
         expect(partialUpdate.title).toBeUndefined();
      });
   });

   describe('BookmarkNoteQueryParams', () => {
      it('should create valid query parameters', () => {
         const params: BookmarkNoteQueryParams = {
            audiobookId: 'audiobook-id',
            chapterId: 'chapter-id',
            page: 1,
            limit: 20,
            sortBy: 'createdAt',
            sortOrder: 'desc',
            search: 'keyword',
         };

         expect(params.audiobookId).toBe('audiobook-id');
         expect(params.search).toBe('keyword');
      });
   });

   describe('BookmarkNoteResponse', () => {
      it('should create valid BookmarkNoteResponse', () => {
         const response: BookmarkNoteResponse = {
            bookmarks: [createMockBookmarkWithRelations()],
            notes: [createMockNoteWithRelations()],
            totalBookmarks: 1,
            totalNotes: 1,
         };

         expect(response.bookmarks.length).toBe(1);
         expect(response.notes.length).toBe(1);
      });
   });

   describe('BookmarkNoteStats', () => {
      it('should create valid BookmarkNoteStats', () => {
         const stats: BookmarkNoteStats = {
            totalBookmarks: 10,
            totalNotes: 5,
            bookmarksByAudiobook: [
               {
                  audiobookId: 'audiobook-1',
                  audiobookTitle: 'Book 1',
                  count: 5,
               },
            ],
            notesByAudiobook: [
               {
                  audiobookId: 'audiobook-1',
                  audiobookTitle: 'Book 1',
                  count: 3,
               },
            ],
         };

         expect(stats.totalBookmarks).toBe(10);
         expect(stats.bookmarksByAudiobook.length).toBe(1);
      });
   });
});
