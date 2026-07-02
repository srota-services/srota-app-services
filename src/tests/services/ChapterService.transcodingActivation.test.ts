/**
 * ChapterService transcoding completion activation tests
 */

import { SubscriptionGatingMode } from '@prisma/client';
import { ChapterService } from '../../services/ChapterService';
import { attachPrismaTransaction } from '../helpers/prismaMock';
import { emitCacheInvalidation } from '../../services/DomainEventPublisher';
import { RabbitMQFactory } from '../../config/rabbitmq';

jest.mock('../../services/DomainEventPublisher', () => ({
   emitCacheInvalidation: jest.fn(),
}));
jest.mock('../../config/rabbitmq');
jest.mock('../../services/FileUrlService', () => ({
   fileUrlService: {
      resolveChapterMedia: jest.fn(async (chapter: Record<string, unknown>) => chapter),
      resolveChapterMediaList: jest.fn(async (chapters: Record<string, unknown>[]) => chapters),
   },
}));
jest.mock('../../services/ImageAssetService', () => ({
   ImageAssetService: jest.fn().mockImplementation(() => ({
      generateAndStoreVariants: jest.fn(),
      deleteAssetsForEntity: jest.fn(),
   })),
}));

describe('ChapterService.handleTranscodingCompleted', () => {
   const mockFindUnique = jest.fn();
   const mockUpdate = jest.fn();

   beforeEach(() => {
      jest.clearAllMocks();
      mockUpdate.mockResolvedValue({});
   });

   function createService(): ChapterService {
      const prisma = attachPrismaTransaction({
         chapter: {
            findUnique: mockFindUnique,
            update: mockUpdate,
         },
      }) as unknown as ConstructorParameters<typeof ChapterService>[0];

      return new ChapterService(prisma);
   }

   it('activates chapter when transcoding completes and no schedule is set', async () => {
      mockFindUnique.mockResolvedValue({
         id: 'chapter-1',
         audiobookId: 'book-1',
         isActive: false,
         transcodingReady: false,
         scheduledAt: null,
      });

      await createService().handleTranscodingCompleted({
         chapterId: 'chapter-1',
         audiobookId: 'book-1',
         bitrates: [64, 128, 256],
         status: 'completed',
         timestamp: new Date().toISOString(),
      });

      expect(mockUpdate).toHaveBeenCalledWith(
         expect.objectContaining({
            where: { id: 'chapter-1' },
            data: {
               transcodingReady: true,
               isActive: true,
               scheduledAt: null,
            },
         }),
      );
      expect(emitCacheInvalidation).toHaveBeenCalledWith('chapter', 'updated', 'chapter-1', {
         audiobookId: 'book-1',
      });
   });

   it('sets transcodingReady but keeps inactive when scheduledAt is in the future', async () => {
      const future = new Date(Date.now() + 60_000);
      mockFindUnique.mockResolvedValue({
         id: 'chapter-1',
         audiobookId: 'book-1',
         isActive: false,
         transcodingReady: false,
         scheduledAt: future,
      });

      await createService().handleTranscodingCompleted({
         chapterId: 'chapter-1',
         audiobookId: 'book-1',
         bitrates: [64, 128, 256],
         status: 'completed',
         timestamp: new Date().toISOString(),
      });

      expect(mockUpdate).toHaveBeenCalledWith(
         expect.objectContaining({
            data: { transcodingReady: true },
         }),
      );
   });

   it('no-ops when chapter is already active and transcoding ready', async () => {
      mockFindUnique.mockResolvedValue({
         id: 'chapter-1',
         audiobookId: 'book-1',
         isActive: true,
         transcodingReady: true,
         scheduledAt: null,
      });

      await createService().handleTranscodingCompleted({
         chapterId: 'chapter-1',
         audiobookId: 'book-1',
         bitrates: [64, 128, 256],
         status: 'completed',
         timestamp: new Date().toISOString(),
      });

      expect(mockUpdate).not.toHaveBeenCalled();
   });

   it('no-ops when chapter was deleted', async () => {
      mockFindUnique.mockResolvedValue(null);

      await createService().handleTranscodingCompleted({
         chapterId: 'missing',
         audiobookId: 'book-1',
         bitrates: [64, 128, 256],
         status: 'completed',
         timestamp: new Date().toISOString(),
      });

      expect(mockUpdate).not.toHaveBeenCalled();
   });
});

describe('ChapterService.createChapter inactive defaults', () => {
   it('creates chapter with isActive false and transcodingReady false', async () => {
      const mockCreate = jest.fn().mockResolvedValue({
         id: 'chapter-1',
         audiobookId: 'book-1',
         title: 'Chapter',
         description: null,
         chapterNumber: 1,
         duration: 100,
         filePath: 'uploads/chapters/audio.mp3',
         fileSize: BigInt(1024),
         coverImage: 'cover.jpg',
         startPosition: 0,
         endPosition: 100,
         isActive: false,
         transcodingReady: false,
         sourceUploadStatus: 'ready',
         sourceUploadError: null,
         scheduledAt: null,
         createdAt: new Date(),
         updatedAt: new Date(),
      });

      (RabbitMQFactory.getConnection as jest.Mock).mockReturnValue({
         publishTranscodingJob: jest.fn().mockResolvedValue(true),
      });

      const prisma = attachPrismaTransaction({
         audioBook: {
            findUnique: jest.fn().mockResolvedValue({
               id: 'book-1',
               subscriptionGatingMode: SubscriptionGatingMode.NONE,
               minSubscriptionTier: null,
            }),
         },
         chapter: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: mockCreate,
            update: jest.fn(),
         },
      }) as unknown as ConstructorParameters<typeof ChapterService>[0];

      const service = new ChapterService(prisma);
      await service.createChapter(
         {
            audiobookId: 'book-1',
            title: 'Chapter',
            chapterNumber: 1,
            duration: 100,
            filePath: 'uploads/chapters/audio.mp3',
            fileSize: 1024,
            startPosition: 0,
            endPosition: 100,
            coverImage: 'cover.jpg',
         },
         undefined,
         undefined,
      );

      expect(mockCreate).toHaveBeenCalledWith(
         expect.objectContaining({
            data: expect.objectContaining({
               isActive: false,
               transcodingReady: false,
            }),
         }),
      );
   });
});
