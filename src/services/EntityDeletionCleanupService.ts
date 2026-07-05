/**
 * Cross-entity deletion cleanup for app-service data.
 */
import { PrismaClient, ReviewerType } from '@prisma/client';
import { AudiobookMediaCleanupService } from './AudiobookMediaCleanupService';
import { mediaCleanupService } from './MediaCleanupService';
import { runWrite } from '../utils/prismaTransaction';

export class EntityDeletionCleanupService {
   private audiobookMediaCleanup: AudiobookMediaCleanupService;

   constructor(private prisma: PrismaClient) {
      this.audiobookMediaCleanup = new AudiobookMediaCleanupService(prisma);
   }

   async cleanupUser(userId: string, authorId?: string): Promise<void> {
      const offlineDownloads = await this.prisma.offlineDownload.findMany({
         where: { userId },
         select: { filePath: true },
      });

      const mediaPaths: Array<string | null | undefined> = offlineDownloads.map((d) => d.filePath);

      await runWrite(this.prisma, async (tx) => {
         await tx.offlineDownload.deleteMany({ where: { userId } });
      });

      await mediaCleanupService.deleteStoredFiles(mediaPaths);

      if (authorId) {
         await this.cleanupAuthor(authorId, userId);
      }
   }

   async cleanupAuthor(authorId: string, _userId: string): Promise<void> {
      const audiobooks = await this.prisma.audioBook.findMany({
         where: { ownerType: 'AUTHOR', ownerId: authorId },
         select: { id: true },
      });

      for (const book of audiobooks) {
         await this.audiobookMediaCleanup.deleteAudiobookWithChapters(book.id);
      }

      await runWrite(this.prisma, async (tx) => {
         await tx.authorReview.deleteMany({
            where: {
               OR: [{ authorId }, { reviewerType: ReviewerType.AUTHOR, reviewerId: authorId }],
            },
         });
         await tx.authorTier.deleteMany({ where: { authorId } });
      });
   }

   async cleanupOrganization(organizationId: string): Promise<void> {
      const audiobooks = await this.prisma.audioBook.findMany({
         where: { ownerType: 'ORGANIZATION', ownerId: organizationId },
         select: { id: true },
      });

      for (const book of audiobooks) {
         await this.audiobookMediaCleanup.deleteAudiobookWithChapters(book.id);
      }

      await runWrite(this.prisma, async (tx) => {
         await tx.organizationReview.deleteMany({ where: { organizationId } });
         await tx.organizationTier.deleteMany({ where: { organizationId } });
      });
   }
}
