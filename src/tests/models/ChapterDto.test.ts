/**
 * ChapterDto Tests
 * Tests for Chapter DTO interfaces and type validation
 */

import {
   ChapterData,
   ChapterWithRelations,
   ChapterWithProgress,
   CreateChapterRequest,
   UpdateChapterRequest,
   ChapterProgressData,
   UpdateChapterProgressRequest,
   ChapterQueryParams,
   ChapterNavigation,
} from '../../models/ChapterDto';

describe('ChapterDto', () => {
   // Mock factories for creating test data
   const createMockChapterData = (overrides = {}): ChapterData => {
      return {
         id: 'chapter-id',
         audiobookId: 'audiobook-id',
         title: 'Test Chapter',
         description: 'Test Description',
         chapterNumber: 1,
         duration: 1800, // 30 minutes
         filePath: '/path/to/chapter.mp3',
         fileSize: 1024 * 1024 * 10, // 10 MB
         coverImage: 'https://example.com/covers/chapter.jpg',
         isActive: true,
         startPosition: 0,
         endPosition: 1800,
         createdAt: new Date('2024-01-01'),
         updatedAt: new Date('2024-01-02'),
         ...overrides,
      };
   };

   const createMockChapterWithRelations = (overrides = {}): ChapterWithRelations => {
      const baseChapter = createMockChapterData();
      return {
         ...baseChapter,
         audiobook: {
            id: 'audiobook-id',
            title: 'Test Audiobook',
            author: 'Test Author',
         },
         chapterProgress: [],
         bookmarks: [],
         notes: [],
         ...overrides,
      };
   };

   const createMockChapterProgressData = (overrides = {}): ChapterProgressData => {
      return {
         id: 'progress-id',
         userId: 'user-id',
         chapterId: 'chapter-id',
         currentPosition: 300,
         completed: false,
         lastListenedAt: new Date('2024-01-10'),
         createdAt: new Date('2024-01-01'),
         updatedAt: new Date('2024-01-02'),
         ...overrides,
      };
   };

   const createMockChapterWithProgress = (overrides = {}): ChapterWithProgress => {
      const baseChapter = createMockChapterData();
      return {
         ...baseChapter,
         userProgress: createMockChapterProgressData(),
         overallProgress: 50,
         ...overrides,
      };
   };

   const createMockChapterNavigation = (overrides = {}): ChapterNavigation => {
      const currentChapter = createMockChapterWithProgress();
      const previousChapter = createMockChapterWithProgress({ chapterNumber: 2 });
      const nextChapter = createMockChapterWithProgress({ chapterNumber: 4 });

      return {
         currentChapter,
         previousChapter,
         nextChapter,
         totalChapters: 10,
         currentChapterIndex: 3,
         ...overrides,
      };
   };

   describe('ChapterData', () => {
      it('should create valid ChapterData object', () => {
         const chapter = createMockChapterData();

         expect(chapter.id).toBe('chapter-id');
         expect(chapter.audiobookId).toBe('audiobook-id');
         expect(chapter.title).toBe('Test Chapter');
         expect(chapter.chapterNumber).toBe(1);
         expect(chapter.duration).toBe(1800);
         expect(chapter.filePath).toBe('/path/to/chapter.mp3');
         expect(chapter.fileSize).toBe(1024 * 1024 * 10);
         expect(chapter.coverImage).toBe('https://example.com/covers/chapter.jpg');
         expect(chapter.isActive).toBe(true);
         expect(chapter.startPosition).toBe(0);
         expect(chapter.endPosition).toBe(1800);
      });

      it('should handle optional description field', () => {
         const chapterWithoutDescription = createMockChapterData({
            description: undefined,
         });

         expect(chapterWithoutDescription.description).toBeUndefined();
      });

      it('should create ChapterData with all required fields', () => {
         const minimalChapter: ChapterData = {
            id: 'min-chapter-id',
            audiobookId: 'audiobook-id',
            title: 'Minimal Chapter',
            chapterNumber: 1,
            duration: 60,
            filePath: '/path/to/file.mp3',
            fileSize: 1024,
            coverImage: 'https://example.com/covers/minimal.jpg',
            isActive: true,
            startPosition: 0,
            endPosition: 60,
            createdAt: new Date(),
            updatedAt: new Date(),
         };

         expect(minimalChapter.id).toBe('min-chapter-id');
         expect(minimalChapter.description).toBeUndefined();
      });
   });

   describe('ChapterWithRelations', () => {
      it('should create valid ChapterWithRelations object', () => {
         const chapter = createMockChapterWithRelations();

         expect(chapter.audiobook).toBeDefined();
         expect(chapter.audiobook?.id).toBe('audiobook-id');
         expect(chapter.audiobook?.title).toBe('Test Audiobook');
         expect(chapter.chapterProgress).toEqual([]);
         expect(chapter.bookmarks).toEqual([]);
         expect(chapter.notes).toEqual([]);
      });

      it('should handle optional audiobook field', () => {
         const chapterWithoutAudiobook = createMockChapterWithRelations({
            audiobook: undefined,
         });

         expect(chapterWithoutAudiobook.audiobook).toBeUndefined();
      });

      it('should handle populated chapterProgress array', () => {
         const progressData = createMockChapterProgressData();
         const chapter = createMockChapterWithRelations({
            chapterProgress: [progressData],
         });

         expect(chapter.chapterProgress?.length).toBe(1);
         if (chapter.chapterProgress && chapter.chapterProgress[0]) {
            expect(chapter.chapterProgress[0].currentPosition).toBe(300);
         }
      });
   });

   describe('ChapterWithProgress', () => {
      it('should create valid ChapterWithProgress object', () => {
         const chapter = createMockChapterWithProgress();

         expect(chapter.userProgress).toBeDefined();
         expect(chapter.userProgress?.currentPosition).toBe(300);
         expect(chapter.userProgress?.completed).toBe(false);
         expect(chapter.overallProgress).toBe(50);
      });

      it('should handle optional userProgress', () => {
         const chapter = createMockChapterWithProgress({
            userProgress: undefined,
         });

         expect(chapter.userProgress).toBeUndefined();
         expect(chapter.overallProgress).toBeDefined();
      });

      it('should handle completed progress', () => {
         const completedProgress = createMockChapterProgressData({
            completed: true,
            currentPosition: 1800,
         });
         const chapter = createMockChapterWithProgress({
            userProgress: completedProgress,
            overallProgress: 100,
         });

         expect(chapter.userProgress?.completed).toBe(true);
         expect(chapter.overallProgress).toBe(100);
      });
   });

   describe('CreateChapterRequest', () => {
      it('should create valid CreateChapterRequest', () => {
         const request: CreateChapterRequest = {
            audiobookId: 'audiobook-id',
            title: 'New Chapter',
            chapterNumber: 5,
            duration: 2400,
            filePath: '/path/to/new-chapter.mp3',
            fileSize: 1024 * 1024 * 15,
            startPosition: 7200,
            endPosition: 9600,
         };

         expect(request.audiobookId).toBe('audiobook-id');
         expect(request.title).toBe('New Chapter');
         expect(request.chapterNumber).toBe(5);
         expect(request.duration).toBe(2400);
      });

      it('should handle optional fields in CreateChapterRequest', () => {
         const minimalRequest: CreateChapterRequest = {
            audiobookId: 'audiobook-id',
            title: 'Chapter Title',
            chapterNumber: 1,
            duration: 1800,
            startPosition: 0,
            endPosition: 1800,
         };

         expect(minimalRequest.description).toBeUndefined();
         expect(minimalRequest.filePath).toBeUndefined();
         expect(minimalRequest.fileSize).toBeUndefined();
      });

      it('should handle file upload scenarios without filePath', () => {
         const uploadRequest: CreateChapterRequest = {
            audiobookId: 'audiobook-id',
            title: 'Uploaded Chapter',
            chapterNumber: 1,
            duration: 1800,
            startPosition: 0,
            endPosition: 1800,
         };

         expect(uploadRequest.filePath).toBeUndefined();
         expect(uploadRequest.fileSize).toBeUndefined();
      });
   });

   describe('UpdateChapterRequest', () => {
      it('should accept all optional fields', () => {
         const update: UpdateChapterRequest = {
            title: 'Updated Title',
            description: 'Updated Description',
            chapterNumber: 2,
            duration: 2400,
            filePath: '/new/path.mp3',
            fileSize: 2048 * 1024,
            startPosition: 100,
            endPosition: 2500,
         };

         expect(update.title).toBe('Updated Title');
         expect(update.description).toBe('Updated Description');
         expect(update.chapterNumber).toBe(2);
      });

      it('should accept partial updates', () => {
         const partialUpdate: UpdateChapterRequest = {
            title: 'Only Title Updated',
         };

         expect(partialUpdate.title).toBe('Only Title Updated');
         expect(partialUpdate.description).toBeUndefined();
         expect(partialUpdate.chapterNumber).toBeUndefined();
      });
   });

   describe('ChapterProgressData', () => {
      it('should create valid ChapterProgressData', () => {
         const progress = createMockChapterProgressData();

         expect(progress.id).toBe('progress-id');
         expect(progress.userId).toBe('user-id');
         expect(progress.chapterId).toBe('chapter-id');
         expect(progress.currentPosition).toBe(300);
         expect(progress.completed).toBe(false);
         expect(progress.lastListenedAt).toBeInstanceOf(Date);
      });

      it('should handle completed chapter progress', () => {
         const completedProgress = createMockChapterProgressData({
            completed: true,
            currentPosition: 1800,
         });

         expect(completedProgress.completed).toBe(true);
         expect(completedProgress.currentPosition).toBe(1800);
      });
   });

   describe('UpdateChapterProgressRequest', () => {
      it('should update position only', () => {
         const update: UpdateChapterProgressRequest = {
            currentPosition: 600,
         };

         expect(update.currentPosition).toBe(600);
         expect(update.completed).toBeUndefined();
      });

      it('should update position and completion status', () => {
         const update: UpdateChapterProgressRequest = {
            currentPosition: 1800,
            completed: true,
         };

         expect(update.currentPosition).toBe(1800);
         expect(update.completed).toBe(true);
      });

      it('should handle zero position', () => {
         const update: UpdateChapterProgressRequest = {
            currentPosition: 0,
            completed: false,
         };

         expect(update.currentPosition).toBe(0);
         expect(update.completed).toBe(false);
      });
   });

   describe('ChapterQueryParams', () => {
      it('should create valid query parameters', () => {
         const params: ChapterQueryParams = {
            audiobookId: 'audiobook-id',
            page: 1,
            limit: 20,
            sortBy: 'chapterNumber',
            sortOrder: 'asc',
         };

         expect(params.audiobookId).toBe('audiobook-id');
         expect(params.page).toBe(1);
         expect(params.limit).toBe(20);
         expect(params.sortBy).toBe('chapterNumber');
         expect(params.sortOrder).toBe('asc');
      });

      it('should handle descending sort order', () => {
         const params: ChapterQueryParams = {
            sortOrder: 'desc',
         };

         expect(params.sortOrder).toBe('desc');
      });

      it('should handle partial query parameters', () => {
         const params: ChapterQueryParams = {
            page: 1,
            limit: 10,
         };

         expect(params.page).toBe(1);
         expect(params.limit).toBe(10);
      });
   });

   describe('ChapterNavigation', () => {
      it('should create valid ChapterNavigation', () => {
         const navigation = createMockChapterNavigation();

         expect(navigation.currentChapter).toBeDefined();
         expect(navigation.previousChapter).toBeDefined();
         expect(navigation.nextChapter).toBeDefined();
         expect(navigation.totalChapters).toBe(10);
         expect(navigation.currentChapterIndex).toBe(3);
      });

      it('should handle navigation at start (no previous chapter)', () => {
         const navigationAtStart = createMockChapterNavigation({
            previousChapter: undefined,
            currentChapterIndex: 0,
         });

         expect(navigationAtStart.previousChapter).toBeUndefined();
         expect(navigationAtStart.currentChapterIndex).toBe(0);
      });

      it('should handle navigation at end (no next chapter)', () => {
         const navigationAtEnd = createMockChapterNavigation({
            nextChapter: undefined,
            currentChapterIndex: 9,
            totalChapters: 10,
         });

         expect(navigationAtEnd.nextChapter).toBeUndefined();
         expect(navigationAtEnd.currentChapterIndex).toBe(9);
      });

      it('should handle single chapter audiobook', () => {
         const singleChapter: ChapterNavigation = {
            currentChapter: createMockChapterWithProgress(),
            totalChapters: 1,
            currentChapterIndex: 0,
         };

         expect(singleChapter.totalChapters).toBe(1);
         expect(singleChapter.currentChapterIndex).toBe(0);
      });
   });

   describe('Edge cases', () => {
      it('should handle zero duration chapters', () => {
         const emptyChapter = createMockChapterData({
            duration: 0,
            startPosition: 0,
            endPosition: 0,
         });

         expect(emptyChapter.duration).toBe(0);
         expect(emptyChapter.startPosition).toBe(0);
         expect(emptyChapter.endPosition).toBe(0);
      });

      it('should handle very large file sizes', () => {
         const largeFile = createMockChapterData({
            fileSize: 1024 * 1024 * 1024 * 2, // 2 GB
         });

         expect(largeFile.fileSize).toBe(2147483648);
      });

      it('should handle negative positions for rewind scenarios', () => {
         const rewindChapter = createMockChapterData({
            startPosition: -100,
         });

         expect(rewindChapter.startPosition).toBe(-100);
      });
   });
});

