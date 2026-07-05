import { PrismaClient } from '@prisma/client';
import { EntityDeletionCleanupService } from '../../services/EntityDeletionCleanupService';
import { AudiobookMediaCleanupService } from '../../services/AudiobookMediaCleanupService';
import { mediaCleanupService } from '../../services/MediaCleanupService';
import { attachPrismaTransaction } from '../helpers/prismaMock';

jest.mock('../../services/AudiobookMediaCleanupService');
jest.mock('../../services/MediaCleanupService', () => ({
   mediaCleanupService: {
      deleteStoredFiles: jest.fn().mockResolvedValue(undefined),
      deleteStoredFile: jest.fn().mockResolvedValue(undefined),
   },
}));

describe('EntityDeletionCleanupService', () => {
   let service: EntityDeletionCleanupService;
   let mockPrisma: {
      offlineDownload: { findMany: jest.Mock; deleteMany: jest.Mock };
      audioBook: { findMany: jest.Mock };
      authorReview: { deleteMany: jest.Mock };
      authorTier: { deleteMany: jest.Mock };
      organizationReview: { deleteMany: jest.Mock };
      organizationTier: { deleteMany: jest.Mock };
   };
   let mockDeleteAudiobookWithChapters: jest.Mock;

   beforeEach(() => {
      jest.clearAllMocks();
      mockDeleteAudiobookWithChapters = jest.fn().mockResolvedValue(undefined);
      (AudiobookMediaCleanupService as jest.Mock).mockImplementation(() => ({
         deleteAudiobookWithChapters: mockDeleteAudiobookWithChapters,
      }));

      mockPrisma = attachPrismaTransaction({
         offlineDownload: {
            findMany: jest.fn().mockResolvedValue([]),
            deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
         },
         audioBook: {
            findMany: jest.fn(),
         },
         authorReview: {
            deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
         },
         authorTier: {
            deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
         },
         organizationReview: {
            deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
         },
         organizationTier: {
            deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
         },
      });

      service = new EntityDeletionCleanupService(mockPrisma as unknown as PrismaClient);
   });

   describe('cleanupUser', () => {
      it('deletes offline downloads and associated media', async () => {
         mockPrisma.offlineDownload.findMany.mockResolvedValue([
            { filePath: 'uploads/downloads/file.mp3' },
         ]);

         await service.cleanupUser('user-1');

         expect(mockPrisma.offlineDownload.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
         expect(mediaCleanupService.deleteStoredFiles).toHaveBeenCalledWith(['uploads/downloads/file.mp3']);
      });

      it('also runs author cleanup when authorId is provided', async () => {
         mockPrisma.audioBook.findMany.mockResolvedValue([]);

         await service.cleanupUser('user-1', 'author-1');

         expect(mockPrisma.authorReview.deleteMany).toHaveBeenCalled();
         expect(mockPrisma.authorTier.deleteMany).toHaveBeenCalledWith({ where: { authorId: 'author-1' } });
      });
   });

   describe('cleanupAuthor', () => {
      it('deletes personal audiobooks by authorId', async () => {
         mockPrisma.audioBook.findMany.mockResolvedValue([{ id: 'book-1' }, { id: 'book-2' }]);

         await service.cleanupAuthor('author-1', 'user-1');

         expect(mockPrisma.audioBook.findMany).toHaveBeenCalledWith({
            where: { ownerType: 'AUTHOR', ownerId: 'author-1' },
            select: { id: true },
         });
         expect(mockDeleteAudiobookWithChapters).toHaveBeenCalledTimes(2);
         expect(mockPrisma.authorReview.deleteMany).toHaveBeenCalled();
         expect(mockPrisma.authorTier.deleteMany).toHaveBeenCalledWith({ where: { authorId: 'author-1' } });
      });
   });

   describe('cleanupOrganization', () => {
      it('deletes all organization audiobooks', async () => {
         mockPrisma.audioBook.findMany.mockResolvedValue([{ id: 'book-org-1' }]);

         await service.cleanupOrganization('org-1');

         expect(mockPrisma.audioBook.findMany).toHaveBeenCalledWith({
            where: { ownerType: 'ORGANIZATION', ownerId: 'org-1' },
            select: { id: true },
         });
         expect(mockDeleteAudiobookWithChapters).toHaveBeenCalledWith('book-org-1');
         expect(mockPrisma.organizationReview.deleteMany).toHaveBeenCalledWith({ where: { organizationId: 'org-1' } });
         expect(mockPrisma.organizationTier.deleteMany).toHaveBeenCalledWith({ where: { organizationId: 'org-1' } });
      });
   });
});
