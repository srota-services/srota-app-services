/**
 * Offline Download Service
 * Handles offline download functionality for audiobooks
 */
import { PrismaClient, DownloadStatus } from '@prisma/client';
import {
   OfflineDownloadData,
   OfflineDownloadWithRelations,
   DownloadRequest,
   DownloadProgress,
   DownloadQueueStatus,
   DownloadStats
} from '../models/OfflineDownloadDto';
import { BackgroundJobService } from './BackgroundJobService';
import { emitCacheInvalidation } from './DomainEventPublisher';
import { ApiError } from '../types/ApiError';
import { fileUrlService } from './FileUrlService';
import { runWrite } from '../utils/prismaTransaction';
import { rethrowServiceError } from '../utils/serviceError';
import { MessageHandler } from '../utils/MessageHandler';

export class OfflineDownloadService {
   private backgroundJobService: BackgroundJobService;

   constructor(private prisma: PrismaClient) {
      this.backgroundJobService = new BackgroundJobService(prisma);
   }

   /**
    * Request an offline download
    */
   async requestDownload(userProfileId: string, downloadRequest: DownloadRequest): Promise<OfflineDownloadData> {
      try {
         // Check if audiobook exists and is available for offline download
         const audiobook = await this.prisma.audioBook.findUnique({
            where: { id: downloadRequest.audiobookId },
         });

         if (!audiobook) {
            throw new ApiError('Audiobook not found', 404);
         }

         if (!audiobook.isOfflineAvailable) {
            throw new ApiError('Audiobook is not available for offline download', 400);
         }

         // Check if user already has a download for this audiobook
         const existingDownload = await this.prisma.offlineDownload.findUnique({
            where: {
               userProfileId_audiobookId: {
                  userProfileId,
                  audiobookId: downloadRequest.audiobookId,
               },
            },
         });

         if (existingDownload) {
            if (existingDownload.status === 'COMPLETED') {
               throw new ApiError('Audiobook is already downloaded', 400);
            } else if (existingDownload.status === 'IN_PROGRESS') {
               throw new ApiError('Download is already in progress', 400);
            } else if (existingDownload.status === 'PENDING') {
               throw new ApiError('Download is already pending', 400);
            }
         }

         // Create download record
         const download = await runWrite(this.prisma, async (tx) =>
            tx.offlineDownload.create({
               data: {
                  userProfileId,
                  audiobookId: downloadRequest.audiobookId,
                  status: 'PENDING',
                  progress: 0,
               },
            }),
         );

         // Schedule download job
         await this.backgroundJobService.scheduleOfflineDownload(
            userProfileId,
            downloadRequest.audiobookId,
            download.id,
            downloadRequest.quality
         );

         emitCacheInvalidation('offline-download', 'created', download.id);
         return {
            id: download.id,
            userProfileId: download.userProfileId,
            audiobookId: download.audiobookId,
            status: download.status,
            progress: download.progress,
            filePath: download.filePath || undefined,
            fileSize: download.fileSize ? Number(download.fileSize) : undefined,
            errorMessage: download.errorMessage || undefined,
            retryCount: download.retryCount,
            createdAt: download.createdAt,
            updatedAt: download.updatedAt,
            completedAt: download.completedAt || undefined
         } as OfflineDownloadData;
      } catch (error) {
         if (error instanceof ApiError) {
            throw error;
         }
         throw new ApiError('Failed to request download', 500);
      }
   }

   /**
    * Get download progress
    */
   async getDownloadProgress(userProfileId: string, downloadId: string): Promise<DownloadProgress> {
      try {
         const download = await this.prisma.offlineDownload.findFirst({
            where: {
               id: downloadId,
               userProfileId,
            },
            include: {
               audiobook: {
                  select: {
                     id: true,
                     title: true,
                     duration: true,
                     fileSize: true,
                     coverImage: true,
                  },
               },
            },
         });

         if (!download) {
            throw new ApiError('Download not found', 404);
         }

         const downloadedSize = download.fileSize
            ? Number(download.fileSize) * (download.progress / 100)
            : 0;

         const downloadData = {
            id: download.id,
            userProfileId: download.userProfileId,
            audiobookId: download.audiobookId,
            status: download.status,
            progress: download.progress,
            filePath: download.filePath || undefined,
            fileSize: download.fileSize ? Number(download.fileSize) : undefined,
            errorMessage: download.errorMessage || undefined,
            retryCount: download.retryCount,
            createdAt: download.createdAt,
            updatedAt: download.updatedAt,
            completedAt: download.completedAt || undefined
         } as OfflineDownloadData;

         return {
            downloadId: download.id,
            audiobookId: download.audiobookId,
            audiobookTitle: download.audiobook.title,
            status: download.status,
            progress: download.progress,
            fileSize: download.fileSize ? Number(download.fileSize) : undefined,
            downloadedSize: downloadedSize,
            estimatedTimeRemaining: this.calculateEstimatedTimeRemaining(downloadData),
            downloadSpeed: this.calculateDownloadSpeed(downloadData),
            errorMessage: download.errorMessage || undefined,
         } as DownloadProgress;
      } catch (error) {
         if (error instanceof ApiError) {
            throw error;
         }
         throw new ApiError('Failed to retrieve download progress', 500);
      }
   }

   /**
    * Get all downloads for a user
    */
   async getUserDownloads(userProfileId: string, status?: DownloadStatus): Promise<OfflineDownloadWithRelations[]> {
      try {
         const whereClause: any = { userProfileId };
         if (status) {
            whereClause.status = status;
         }

         const downloads = await this.prisma.offlineDownload.findMany({
            where: whereClause,
            include: {
               audiobook: {
                  select: {
                     id: true,
                     title: true,
                     author: true,
                     duration: true,
                     fileSize: true,
                     coverImage: true,
                  },
               },
            },
            orderBy: { createdAt: 'desc' },
         });

         return Promise.all(downloads.map(download => this.mapOfflineDownloadWithRelations(download)));
      } catch (error) {
         rethrowServiceError(error, { operation: 'getUserDownloads' }, MessageHandler.getErrorMessage('internal.default'));
      }
   }

   private async mapOfflineDownloadWithRelations(
      download: {
         id: string;
         userProfileId: string;
         audiobookId: string;
         status: DownloadStatus;
         progress: number;
         filePath: string | null;
         fileSize: bigint | null;
         errorMessage: string | null;
         retryCount: number;
         createdAt: Date;
         updatedAt: Date;
         completedAt: Date | null;
         audiobook: {
            id: string;
            title: string;
            author: string;
            duration: number | null;
            fileSize: bigint | null;
            coverImage: string | null;
         };
      }
   ): Promise<OfflineDownloadWithRelations> {
      const [filePath, resolvedMedia] = await Promise.all([
         fileUrlService.resolveForClient(download.filePath),
         fileUrlService.resolveNestedAudiobookMedia(download.audiobook),
      ]);

      return {
         id: download.id,
         userProfileId: download.userProfileId,
         audiobookId: download.audiobookId,
         status: download.status,
         progress: download.progress,
         filePath,
         fileSize: download.fileSize ? Number(download.fileSize) : undefined,
         errorMessage: download.errorMessage || undefined,
         retryCount: download.retryCount,
         createdAt: download.createdAt,
         updatedAt: download.updatedAt,
         completedAt: download.completedAt || undefined,
         audiobook: {
            id: download.audiobook.id,
            title: download.audiobook.title,
            duration: download.audiobook.duration,
            fileSize: download.audiobook.fileSize,
            author: download.audiobook.author,
            coverImage: resolvedMedia.coverImage ?? download.audiobook.coverImage,
            imageAssets: resolvedMedia.imageAssets,
         },
      } as OfflineDownloadWithRelations;
   }

   /**
    * Cancel a download
    */
   async cancelDownload(userProfileId: string, downloadId: string): Promise<void> {
      try {
         const download = await this.prisma.offlineDownload.findFirst({
            where: {
               id: downloadId,
               userProfileId,
            },
         });

         if (!download) {
            throw new ApiError('Download not found', 404);
         }

         if (download.status === 'COMPLETED') {
            throw new ApiError('Cannot cancel completed download', 400);
         }

         if (download.status === 'CANCELLED') {
            throw new ApiError('Download is already cancelled', 400);
         }

         await runWrite(this.prisma, async (tx) =>
            tx.offlineDownload.update({
               where: { id: downloadId },
               data: {
                  status: 'CANCELLED',
               },
            }),
         );
      } catch (error) {
         if (error instanceof ApiError) {
            throw error;
         }
         throw new ApiError('Failed to cancel download', 500);
      }
   }

   /**
    * Delete a completed download
    */
   async deleteDownload(userProfileId: string, downloadId: string): Promise<void> {
      try {
         const download = await this.prisma.offlineDownload.findFirst({
            where: {
               id: downloadId,
               userProfileId,
            },
         });

         if (!download) {
            throw new ApiError('Download not found', 404);
         }

         if (download.status !== 'COMPLETED') {
            throw new ApiError('Can only delete completed downloads', 400);
         }

         // In real implementation, delete the actual file
         if (download.filePath) {
            // await fs.unlink(download.filePath);
            console.log(`Would delete file: ${download.filePath}`);
         }

         await runWrite(this.prisma, async (tx) =>
            tx.offlineDownload.delete({
               where: { id: downloadId },
            }),
         );
         emitCacheInvalidation('offline-download', 'deleted', downloadId);
      } catch (error) {
         if (error instanceof ApiError) {
            throw error;
         }
         throw new ApiError('Failed to delete download', 500);
      }
   }

   /**
    * Retry a failed download
    */
   async retryDownload(userProfileId: string, downloadId: string): Promise<void> {
      try {
         const download = await this.prisma.offlineDownload.findFirst({
            where: {
               id: downloadId,
               userProfileId,
            },
         });

         if (!download) {
            throw new ApiError('Download not found', 404);
         }

         if (download.status !== 'FAILED') {
            throw new ApiError('Can only retry failed downloads', 400);
         }

         if (download.retryCount >= 3) {
            throw new ApiError('Maximum retry attempts exceeded', 400);
         }

         // Reset download status
         await runWrite(this.prisma, async (tx) =>
            tx.offlineDownload.update({
               where: { id: downloadId },
               data: {
                  status: 'PENDING',
                  progress: 0,
                  errorMessage: null,
                  retryCount: download.retryCount + 1,
               },
            }),
         );

         // Schedule retry
         await this.backgroundJobService.scheduleOfflineDownload(
            userProfileId,
            download.audiobookId,
            downloadId,
            undefined,
            download.retryCount + 1
         );
      } catch (error) {
         if (error instanceof ApiError) {
            throw error;
         }
         throw new ApiError('Failed to retry download', 500);
      }
   }

   /**
    * Get download queue status
    */
   async getDownloadQueueStatus(): Promise<DownloadQueueStatus> {
      try {
         const [pending, inProgress, completed, failed] = await Promise.all([
            this.prisma.offlineDownload.count({ where: { status: 'PENDING' } }),
            this.prisma.offlineDownload.count({ where: { status: 'IN_PROGRESS' } }),
            this.prisma.offlineDownload.count({ where: { status: 'COMPLETED' } }),
            this.prisma.offlineDownload.count({ where: { status: 'FAILED' } }),
         ]);

         const total = pending + inProgress + completed + failed;

         return {
            pending,
            inProgress,
            completed,
            failed,
            total,
         };
      } catch (error) {
         rethrowServiceError(error, { operation: 'getDownloadQueueStatus' }, MessageHandler.getErrorMessage('internal.default'));
      }
   }

   /**
    * Get download statistics
    */
   async getDownloadStats(): Promise<DownloadStats> {
      try {
         const [totalDownloads, successfulDownloads, failedDownloads, downloadsByStatus] = await Promise.all([
            this.prisma.offlineDownload.count(),
            this.prisma.offlineDownload.count({ where: { status: 'COMPLETED' } }),
            this.prisma.offlineDownload.count({ where: { status: 'FAILED' } }),
            this.prisma.offlineDownload.groupBy({
               by: ['status'],
               _count: { status: true },
            }),
         ]);

         // Calculate total downloaded size
         const completedDownloads = await this.prisma.offlineDownload.findMany({
            where: { status: 'COMPLETED' },
            select: { fileSize: true, createdAt: true, completedAt: true },
         });

         const totalDownloadedSize = completedDownloads.reduce((sum, download) => {
            return sum + Number(download.fileSize || 0);
         }, 0);

         // Calculate average download time
         const downloadTimes = completedDownloads
            .filter(d => d.completedAt)
            .map(d => d.completedAt!.getTime() - d.createdAt.getTime());

         const averageDownloadTime = downloadTimes.length > 0
            ? downloadTimes.reduce((sum, time) => sum + time, 0) / downloadTimes.length / 1000 // Convert to seconds
            : 0;

         return {
            totalDownloads,
            successfulDownloads,
            failedDownloads,
            totalDownloadedSize,
            averageDownloadTime,
            downloadsByStatus: downloadsByStatus.map(d => ({
               status: d.status,
               count: d._count.status,
            })),
         };
      } catch (error) {
         rethrowServiceError(error, { operation: 'getDownloadStats' }, MessageHandler.getErrorMessage('internal.default'));
      }
   }

   /**
    * Update audiobook offline availability
    */
   async updateOfflineAvailability(audiobookId: string, isAvailable: boolean): Promise<void> {
      try {
         await runWrite(this.prisma, async (tx) =>
            tx.audioBook.update({
               where: { id: audiobookId },
               data: { isOfflineAvailable: isAvailable },
            }),
         );
      } catch (error) {
         rethrowServiceError(error, { operation: 'updateOfflineAvailability' }, MessageHandler.getErrorMessage('internal.default'));
      }
   }

   /**
    * Calculate estimated time remaining for download
    */
   private calculateEstimatedTimeRemaining(download: OfflineDownloadData): number | undefined {
      if (download.status !== 'IN_PROGRESS' || download.progress === 0) {
         return undefined;
      }

      const elapsedTime = Date.now() - download.createdAt.getTime();
      const progressRatio = download.progress / 100;
      const estimatedTotalTime = elapsedTime / progressRatio;
      const remainingTime = estimatedTotalTime - elapsedTime;

      return Math.max(0, Math.floor(remainingTime / 1000)); // Return in seconds
   }

   /**
    * Calculate download speed
    */
   private calculateDownloadSpeed(download: OfflineDownloadData): number | undefined {
      if (download.status !== 'IN_PROGRESS' || download.progress === 0) {
         return undefined;
      }

      const elapsedTime = Date.now() - download.createdAt.getTime();
      const downloadedBytes = Number(download.fileSize || 0) * (download.progress / 100);
      const speed = downloadedBytes / (elapsedTime / 1000); // Bytes per second

      return Math.floor(speed);
   }
}
