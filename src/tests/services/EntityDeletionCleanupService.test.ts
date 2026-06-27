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
      userProfile: { findUnique: jest.Mock; delete: jest.Mock };
      authorProfile: { findUnique: jest.Mock; delete: jest.Mock };
      audioBook: { findMany: jest.Mock };
   };
   let mockDeleteAudiobookWithChapters: jest.Mock;

   beforeEach(() => {
      jest.clearAllMocks();
      mockDeleteAudiobookWithChapters = jest.fn().mockResolvedValue(undefined);
      (AudiobookMediaCleanupService as jest.Mock).mockImplementation(() => ({
         deleteAudiobookWithChapters: mockDeleteAudiobookWithChapters,
      }));

      mockPrisma = attachPrismaTransaction({
         userProfile: {
            findUnique: jest.fn(),
            delete: jest.fn().mockResolvedValue(undefined),
         },
         authorProfile: {
            findUnique: jest.fn(),
            delete: jest.fn().mockResolvedValue(undefined),
         },
         audioBook: {
            findMany: jest.fn(),
         },
      });

      service = new EntityDeletionCleanupService(mockPrisma as unknown as PrismaClient);
   });

   describe('cleanupUser', () => {
      it('deletes user profile and associated media', async () => {
         mockPrisma.userProfile.findUnique.mockResolvedValue({
            avatar: 'uploads/images/users/avatar.jpg',
            offlineDownloads: [{ filePath: 'uploads/downloads/file.mp3' }],
         });

         await service.cleanupUser('user-1');

         expect(mockPrisma.userProfile.delete).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
         expect(mediaCleanupService.deleteStoredFiles).toHaveBeenCalled();
      });

      it('also runs author cleanup when authorId is provided', async () => {
         mockPrisma.userProfile.findUnique.mockResolvedValue(null);
         mockPrisma.authorProfile.findUnique.mockResolvedValue({ avatar: 'uploads/images/authors/av.jpg' });
         mockPrisma.audioBook.findMany.mockResolvedValue([]);

         await service.cleanupUser('user-1', 'author-1');

         expect(mockPrisma.authorProfile.delete).toHaveBeenCalledWith({ where: { authorId: 'author-1' } });
      });
   });

   describe('cleanupAuthor', () => {
      it('deletes personal audiobooks by authorId and author profile', async () => {
         mockPrisma.authorProfile.findUnique.mockResolvedValue({ avatar: 'uploads/images/authors/av.jpg' });
         mockPrisma.audioBook.findMany.mockResolvedValue([{ id: 'book-1' }, { id: 'book-2' }]);

         await service.cleanupAuthor('author-1', 'user-1');

         expect(mockPrisma.audioBook.findMany).toHaveBeenCalledWith({
            where: { ownerType: 'AUTHOR', ownerId: 'author-1' },
            select: { id: true },
         });
         expect(mockDeleteAudiobookWithChapters).toHaveBeenCalledTimes(2);
         expect(mockPrisma.authorProfile.delete).toHaveBeenCalledWith({ where: { authorId: 'author-1' } });
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
      });
   });
});
