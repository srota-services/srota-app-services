/**
 * ChapterService delete cleanup tests
 */

import { ChapterService } from '../../services/ChapterService';
import { RabbitMQFactory } from '../../config/rabbitmq';
import { mediaCleanupService } from '../../services/MediaCleanupService';
import { ImageAssetService } from '../../services/ImageAssetService';
import { attachPrismaTransaction } from '../helpers/prismaMock';

jest.mock('../../config/rabbitmq');
jest.mock('../../services/MediaCleanupService', () => ({
   mediaCleanupService: {
      deleteStoredFiles: jest.fn().mockResolvedValue(undefined),
      deleteStoredFile: jest.fn().mockResolvedValue(undefined),
   },
}));
jest.mock('../../services/ImageAssetService', () => ({
   ImageAssetService: jest.fn().mockImplementation(() => ({
      deleteAssetsForEntity: jest.fn().mockResolvedValue(undefined),
   })),
}));

describe('ChapterService.deleteChapter', () => {
   const mockFindUnique = jest.fn();
   const mockDelete = jest.fn();
   const mockPublishChapterDeletion = jest.fn().mockResolvedValue(true);

   beforeEach(() => {
      jest.clearAllMocks();

      (RabbitMQFactory.getConnection as jest.Mock).mockReturnValue({
         publishChapterDeletion: mockPublishChapterDeletion,
      });
   });

   it('deletes stored media before removing the chapter record', async () => {
      mockFindUnique.mockResolvedValue({
         id: 'chapter-1',
         audiobookId: 'book-1',
         filePath: 'uploads/chapters/audio.mp3',
         coverImage: 'uploads/images/chapters/cover.jpg',
      });
      mockDelete.mockResolvedValue(undefined);

      const prisma = attachPrismaTransaction({
         chapter: {
            findUnique: mockFindUnique,
            delete: mockDelete,
         },
      }) as unknown as ConstructorParameters<typeof ChapterService>[0];

      const service = new ChapterService(prisma);
      await service.deleteChapter('chapter-1');

      expect(mediaCleanupService.deleteStoredFile).toHaveBeenCalledWith('uploads/images/chapters/cover.jpg');
      expect(mediaCleanupService.deleteStoredFile).toHaveBeenCalledWith('uploads/chapters/audio.mp3');
      expect(ImageAssetService).toHaveBeenCalled();
      expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'chapter-1' } });
      expect(mockPublishChapterDeletion).toHaveBeenCalledWith('chapter-1');
   });
});
