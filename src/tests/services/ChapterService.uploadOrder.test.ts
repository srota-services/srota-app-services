/**
 * ChapterService DB-first source audio upload order tests
 */

import { SubscriptionGatingMode } from '@prisma/client';
import { ChapterService } from '../../services/ChapterService';
import { FileUploadService } from '../../services/FileUploadService';
import { RabbitMQFactory } from '../../config/rabbitmq';
import { attachPrismaTransaction } from '../helpers/prismaMock';

jest.mock('../../services/FileUploadService');
jest.mock('../../config/rabbitmq');
jest.mock('../../services/DomainEventPublisher', () => ({
   emitCacheInvalidation: jest.fn(),
}));
jest.mock('../../services/chapterSubscriptionTierInvalidation', () => ({
   emitChapterSubscriptionTierInvalidation: jest.fn(),
}));
jest.mock('../../services/FileUrlService', () => ({
   fileUrlService: {
      resolveChapterMedia: jest.fn(async (chapter: Record<string, unknown>) => ({
         ...chapter,
         imageAssets: {},
      })),
      resolveChapterMediaList: jest.fn(async (chapters: Record<string, unknown>[]) =>
         chapters.map((chapter) => ({ ...chapter, imageAssets: {} })),
      ),
   },
}));
jest.mock('../../services/ImageAssetService', () => ({
   ImageAssetService: jest.fn().mockImplementation(() => ({
      deleteAssetsForEntity: jest.fn().mockResolvedValue(undefined),
      generateAndStoreVariants: jest.fn().mockResolvedValue({
         primaryStorageKey: 'uploads/images/chapters/chapter-1/portrait_7_10.jpg',
         variants: {},
      }),
   })),
}));

/** Audiobook mock for upload-order tests (gating is not under test). */
const mockAudiobookNoneGating = {
   id: 'book-1',
   subscriptionGatingMode: SubscriptionGatingMode.NONE,
   minSubscriptionTier: null,
};

describe('ChapterService.createChapter upload order', () => {
   const mockCreate = jest.fn();
   const mockUpdate = jest.fn();
   const mockUploadFile = jest.fn();
   const mockPublish = jest.fn();

   beforeEach(() => {
      jest.clearAllMocks();
      mockCreate.mockResolvedValue({
         id: 'chapter-1',
         audiobookId: 'book-1',
         title: 'Chapter',
         description: null,
         chapterNumber: 1,
         duration: 100,
         filePath: '',
         fileSize: BigInt(0),
         coverImage: 'cover.jpg',
         chapterCardCoverImage: null,
         maximizedChapterCoverImage: null,
         minimizedChapterCoverImage: null,
         startPosition: 0,
         endPosition: 100,
         isActive: true,
         sourceUploadStatus: 'pending',
         sourceUploadError: null,
         scheduledAt: null,
         createdAt: new Date(),
         updatedAt: new Date(),
      });
      mockUpdate.mockResolvedValue({
         ...mockCreate.mock.results[0]?.value,
         filePath: 'uploads/chapters/audio.mp3',
         fileSize: BigInt(1024),
         sourceUploadStatus: 'ready',
      });
      mockUploadFile.mockResolvedValue({
         filePath: 'uploads/chapters/audio.mp3',
         fileSize: 1024,
         originalName: 'audio.mp3',
      });
      mockPublish.mockResolvedValue(true);

      (FileUploadService as jest.Mock).mockImplementation(() => ({
         uploadFile: mockUploadFile,
         deleteFile: jest.fn(),
      }));

      (RabbitMQFactory.getConnection as jest.Mock).mockReturnValue({
         publishTranscodingJob: mockPublish,
      });
   });

   it('creates chapter record before uploading audio file', async () => {
      const prisma = attachPrismaTransaction({
         audioBook: { findUnique: jest.fn().mockResolvedValue(mockAudiobookNoneGating) },
         chapter: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: mockCreate,
            update: mockUpdate,
         },
      }) as unknown as ConstructorParameters<typeof ChapterService>[0];

      const service = new ChapterService(prisma);
      const order: string[] = [];
      const createdChapter = {
         id: 'chapter-1',
         audiobookId: 'book-1',
         title: 'Chapter',
         description: null,
         chapterNumber: 1,
         duration: 100,
         filePath: '',
         fileSize: BigInt(0),
         coverImage: 'cover.jpg',
         chapterCardCoverImage: null,
         maximizedChapterCoverImage: null,
         minimizedChapterCoverImage: null,
         startPosition: 0,
         endPosition: 100,
         isActive: true,
         sourceUploadStatus: 'pending' as const,
         sourceUploadError: null,
         scheduledAt: null,
         createdAt: new Date(),
         updatedAt: new Date(),
      };
      mockCreate.mockImplementation(async () => {
         order.push('create');
         return createdChapter;
      });
      mockUpdate.mockImplementation(async () => {
         order.push('update');
         return {
            ...createdChapter,
            filePath: 'uploads/chapters/audio.mp3',
            fileSize: BigInt(1024),
            sourceUploadStatus: 'ready' as const,
         };
      });
      mockUploadFile.mockImplementation(async () => {
         order.push('upload');
         return {
            filePath: 'uploads/chapters/audio.mp3',
            fileSize: 1024,
            originalName: 'audio.mp3',
         };
      });
      mockPublish.mockImplementation(async () => {
         order.push('publish');
         return true;
      });

      await service.createChapter(
         {
            audiobookId: 'book-1',
            title: 'Chapter',
            chapterNumber: 1,
            duration: 100,
            startPosition: 0,
            endPosition: 100,
            coverImage: 'cover.jpg',
         },
         { path: '/tmp/audio.mp3', size: 1024 } as Express.Multer.File,
         undefined
      );

      expect(order).toEqual(['create', 'upload', 'update', 'publish']);
   });

   it('marks sourceUploadStatus failed and does not publish when upload fails after create', async () => {
      const createdChapter = {
         id: 'chapter-1',
         audiobookId: 'book-1',
         title: 'Chapter',
         description: null,
         chapterNumber: 1,
         duration: 100,
         filePath: '',
         fileSize: BigInt(0),
         coverImage: 'cover.jpg',
         chapterCardCoverImage: null,
         maximizedChapterCoverImage: null,
         minimizedChapterCoverImage: null,
         startPosition: 0,
         endPosition: 100,
         isActive: true,
         sourceUploadStatus: 'pending' as const,
         sourceUploadError: null,
         scheduledAt: null,
         createdAt: new Date(),
         updatedAt: new Date(),
      };

      mockCreate.mockResolvedValue(createdChapter);
      mockUploadFile.mockRejectedValue(new Error('S3 unavailable'));
      mockUpdate.mockResolvedValue({
         ...createdChapter,
         sourceUploadStatus: 'failed',
         sourceUploadError: 'S3 unavailable',
      });

      const prisma = attachPrismaTransaction({
         audioBook: { findUnique: jest.fn().mockResolvedValue(mockAudiobookNoneGating) },
         chapter: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: mockCreate,
            update: mockUpdate,
         },
      }) as unknown as ConstructorParameters<typeof ChapterService>[0];

      const service = new ChapterService(prisma);

      await expect(
         service.createChapter(
            {
               audiobookId: 'book-1',
               title: 'Chapter',
               chapterNumber: 1,
               duration: 100,
               startPosition: 0,
               endPosition: 100,
               coverImage: 'cover.jpg',
            },
            { path: '/tmp/audio.mp3', size: 1024 } as Express.Multer.File,
            undefined
         )
      ).rejects.toThrow('Failed to upload chapter audio');

      expect(mockPublish).not.toHaveBeenCalled();
      expect(mockUpdate).toHaveBeenCalledWith(
         expect.objectContaining({
            where: { id: 'chapter-1' },
            data: expect.objectContaining({ sourceUploadStatus: 'failed' }),
         })
      );
   });
});

describe('ChapterService.updateChapter re-transcode', () => {
   it('publishes transcoding job with forceRetranscode when audio is replaced', async () => {
      const mockPublish = jest.fn().mockResolvedValue(true);
      (RabbitMQFactory.getConnection as jest.Mock).mockReturnValue({
         publishTranscodingJob: mockPublish,
      });
      (FileUploadService as jest.Mock).mockImplementation(() => ({
         uploadFile: jest.fn().mockResolvedValue({
            filePath: 'uploads/chapters/new-audio.mp3',
            fileSize: 2048,
            originalName: 'new.mp3',
         }),
         deleteFile: jest.fn(),
      }));

      const existingChapter = {
         id: 'chapter-1',
         audiobookId: 'book-1',
         title: 'Chapter',
         description: null,
         chapterNumber: 1,
         duration: 100,
         filePath: 'uploads/chapters/old.mp3',
         fileSize: BigInt(1024),
         coverImage: 'cover.jpg',
         chapterCardCoverImage: null,
         maximizedChapterCoverImage: null,
         minimizedChapterCoverImage: null,
         startPosition: 0,
         endPosition: 100,
         isActive: true,
         minSubscriptionTier: null,
         sourceUploadStatus: 'ready',
         sourceUploadError: null,
         scheduledAt: null,
         createdAt: new Date(),
         updatedAt: new Date(),
      };

      const prisma = attachPrismaTransaction({
         audioBook: {
            findUnique: jest.fn().mockResolvedValue({
               subscriptionGatingMode: SubscriptionGatingMode.NONE,
            }),
         },
         chapter: {
            findUnique: jest.fn().mockResolvedValue({
               ...existingChapter,
               audiobook: { type: 'PUBLICATION' },
            }),
            findFirst: jest.fn().mockResolvedValue(null),
            update: jest
               .fn()
               .mockResolvedValueOnce({ ...existingChapter, sourceUploadStatus: 'pending' })
               .mockResolvedValueOnce({
                  ...existingChapter,
                  filePath: 'uploads/chapters/new-audio.mp3',
                  fileSize: BigInt(2048),
                  sourceUploadStatus: 'ready',
               }),
         },
      }) as unknown as ConstructorParameters<typeof ChapterService>[0];

      const service = new ChapterService(prisma);
      await service.updateChapter(
         'chapter-1',
         { title: 'Updated' },
         { path: '/tmp/new.mp3', size: 2048 } as Express.Multer.File,
         undefined
      );

      expect(mockPublish).toHaveBeenCalledWith(
         expect.objectContaining({ forceRetranscode: true }),
         'normal'
      );
   });
});
