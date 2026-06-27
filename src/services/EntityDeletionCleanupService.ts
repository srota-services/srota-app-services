/**
 * Cross-entity deletion cleanup for app-service data.
 */
import { PrismaClient } from '@prisma/client';
import { AudiobookMediaCleanupService } from './AudiobookMediaCleanupService';
import { mediaCleanupService } from './MediaCleanupService';
import { emitCacheInvalidation } from './DomainEventPublisher';
import { runWrite } from '../utils/prismaTransaction';

export class EntityDeletionCleanupService {
   private audiobookMediaCleanup: AudiobookMediaCleanupService;

   constructor(private prisma: PrismaClient) {
      this.audiobookMediaCleanup = new AudiobookMediaCleanupService(prisma);
   }

   async cleanupUser(userId: string, authorId?: string): Promise<void> {
      const profile = await this.prisma.userProfile.findUnique({
         where: { userId },
         select: {
            id: true,
            avatar: true,
            offlineDownloads: { select: { filePath: true } },
         },
      });

      if (!profile) {
         if (authorId) {
            await this.cleanupAuthor(authorId, userId);
         }
         return;
      }

      const mediaPaths: Array<string | null | undefined> = [
         profile.avatar,
         ...profile.offlineDownloads.map((d) => d.filePath),
      ];

      await runWrite(this.prisma, async (tx) => tx.userProfile.delete({ where: { userId } }));

      await mediaCleanupService.deleteStoredFiles(mediaPaths);
      emitCacheInvalidation('user-profile', 'deleted', profile.id, { userId });

      if (authorId) {
         await this.cleanupAuthor(authorId, userId);
      }
   }

   async cleanupAuthor(authorId: string, _userId: string): Promise<void> {
      const authorProfile = await this.prisma.authorProfile.findUnique({
         where: { authorId },
         select: { id: true, avatar: true },
      });

      const audiobooks = await this.prisma.audioBook.findMany({
         where: { ownerType: 'AUTHOR', ownerId: authorId },
         select: { id: true },
      });

      for (const book of audiobooks) {
         await this.audiobookMediaCleanup.deleteAudiobookWithChapters(book.id);
      }

      if (authorProfile) {
         await runWrite(this.prisma, async (tx) => tx.authorProfile.delete({ where: { authorId } }));
         await mediaCleanupService.deleteStoredFile(authorProfile.avatar);
         emitCacheInvalidation('author-profile', 'deleted', authorProfile.id, { authorId });
      }
   }

   async cleanupOrganization(organizationId: string): Promise<void> {
      const audiobooks = await this.prisma.audioBook.findMany({
         where: { ownerType: 'ORGANIZATION', ownerId: organizationId },
         select: { id: true },
      });

      for (const book of audiobooks) {
         await this.audiobookMediaCleanup.deleteAudiobookWithChapters(book.id);
      }
   }
}
