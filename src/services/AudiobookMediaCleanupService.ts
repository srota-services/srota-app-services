/**
 * Audiobook deletion with chapter media cleanup and chapter.deleted events.
 */
import { PrismaClient } from '@prisma/client';
import { RabbitMQFactory } from '../config/rabbitmq';
import { ApiError } from '../types/ApiError';
import { MessageHandler } from '../utils/MessageHandler';
import { mediaCleanupService } from './MediaCleanupService';
import { emitCacheInvalidation } from './DomainEventPublisher';
import { ImageAssetService } from './ImageAssetService';
import { runWrite } from '../utils/prismaTransaction';

export class AudiobookMediaCleanupService {
   private imageAssetService: ImageAssetService;

   constructor(private prisma: PrismaClient) {
      this.imageAssetService = new ImageAssetService(prisma);
   }

   async deleteAudiobookWithChapters(audiobookId: string): Promise<void> {
      const audiobook = await this.prisma.audioBook.findUnique({
         where: { id: audiobookId },
         include: {
            chapters: true,
            offlineDownloads: { select: { filePath: true } },
         },
      });

      if (!audiobook) {
         throw ApiError.notFound(MessageHandler.getErrorMessage('not_found.audiobook'));
      }

      const rabbitMQ = RabbitMQFactory.getConnection();

      for (const chapter of audiobook.chapters) {
         await this.imageAssetService.deleteAssetsForEntity('chapter', chapter.id);
         await mediaCleanupService.deleteStoredFile(chapter.coverImage);
         await mediaCleanupService.deleteStoredFile(chapter.filePath);

         try {
            await rabbitMQ.publishChapterDeletion(chapter.id);
         } catch (error) {
            console.error(`Failed to publish chapter.deleted for chapter ${chapter.id}:`, error);
         }
      }

      await this.imageAssetService.deleteAssetsForEntity('audiobook', audiobookId);
      await mediaCleanupService.deleteStoredFiles([
         audiobook.coverImage,
         ...audiobook.offlineDownloads.map((d) => d.filePath),
      ]);

      await runWrite(this.prisma, async (tx) =>
         tx.audioBook.delete({
            where: { id: audiobookId },
         }),
      );

      for (const chapter of audiobook.chapters) {
         emitCacheInvalidation('chapter', 'deleted', chapter.id, { audiobookId });
      }
      emitCacheInvalidation('audiobook', 'deleted', audiobookId);
   }
}
