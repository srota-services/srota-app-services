/**
 * Background Job Service
 * Handles background jobs using Bull queue for progress calculation and other tasks
 */
import Bull from 'bull';
import { PrismaClient, UserAudioBookType } from '@prisma/client';
import { ChapterService } from './ChapterService';
import { RedisConfigHelper } from '../config/redis';
import { EntityDeletionCleanupService } from './EntityDeletionCleanupService';
import { runInTransaction, runWrite } from '../utils/prismaTransaction';
import { rethrowServiceError } from '../utils/serviceError';
import { MessageHandler } from '../utils/MessageHandler';

// Job data interfaces
export interface ProgressCalculationJobData {
   userId: string;
   audiobookId: string;
   type: 'audiobook_progress' | 'chapter_progress';
}

export interface OfflineDownloadJobData {
   userId: string;
   audiobookId: string;
   downloadId: string;
   quality?: 'high' | 'medium' | 'low';
   retryCount?: number;
}

export interface CleanupJobData {
   type:
      | 'inactive_sessions'
      | 'expired_downloads'
      | 'old_progress_data'
      | 'user_deletion'
      | 'author_deletion'
      | 'organization_deletion';
   userId?: string;
   authorId?: string;
   organizationId?: string;
}

export interface DurationCalculationJobData {
   audiobookId: string;
}

export interface ScheduledActivationJobData {
   type: 'audiobook' | 'chapter';
   id: string;
   waitAttempt?: number;
}

export class BackgroundJobService {
   private progressQueue: Bull.Queue<ProgressCalculationJobData>;
   private downloadQueue: Bull.Queue<OfflineDownloadJobData>;
   private cleanupQueue: Bull.Queue<CleanupJobData>;
   private durationQueue: Bull.Queue<DurationCalculationJobData>;
   private activationQueue: Bull.Queue<ScheduledActivationJobData>;
   private chapterService: ChapterService;
   private entityDeletionCleanup: EntityDeletionCleanupService;

   constructor(private prisma: PrismaClient) {
      const redisUrl = RedisConfigHelper.getRedisUrl();

      // Initialize Bull queues
      this.progressQueue = new Bull('progress-calculation', {
         redis: redisUrl,
      });

      this.downloadQueue = new Bull('offline-download', {
         redis: redisUrl,
      });

      this.cleanupQueue = new Bull('cleanup', {
         redis: redisUrl,
      });

      this.durationQueue = new Bull('duration-calculation', {
         redis: redisUrl,
      });

      this.activationQueue = new Bull('scheduled-activation', {
         redis: redisUrl,
      });

      // Initialize ChapterService with reference to this BackgroundJobService
      // This allows ChapterService to schedule duration calculation jobs
      this.chapterService = new ChapterService(prisma, this);
      this.entityDeletionCleanup = new EntityDeletionCleanupService(prisma);

      this.setupJobProcessors();
      this.setupScheduledJobs();
   }

   /**
    * Setup job processors
    */
   private setupJobProcessors(): void {
      // Progress calculation processor
      this.progressQueue.process('calculate-progress', async (job) => {
         const { userId, audiobookId, type } = job.data;

         try {
            if (type === 'audiobook_progress') {
               if (audiobookId === 'all') {
                  // Calculate progress for all audiobooks for all users
                  await this.calculateAllAudiobookProgress();
               } else {
                  // Validate audiobookId format (should be UUID)
                  // if (!this.isValidUUID(audiobookId)) {
                  //    console.warn(`Invalid audiobookId format: ${audiobookId}, skipping progress calculation`);
                  //    return;
                  // }
                  await this.calculateAudiobookProgress(userId, audiobookId);
               }
            } else if (type === 'chapter_progress') {
               // Validate audiobookId format (should be UUID)
               // if (!this.isValidUUID(audiobookId)) {
               //    console.warn(`Invalid audiobookId format: ${audiobookId}, skipping chapter progress calculation`);
               //    return;
               // }
               await this.calculateChapterProgress(userId, audiobookId);
            }

         } catch (error) {
            // console.error('Progress calculation failed:', error);
            throw error;
         }
      });

      // Offline download processor
      this.downloadQueue.process('download-audiobook', async (job) => {
         const { userId, audiobookId, downloadId, quality: _quality, retryCount = 0 } = job.data;

         try {
            await this.processOfflineDownload(userId, audiobookId, downloadId, _quality);
            console.log(`Offline download completed for user ${userId}, audiobook ${audiobookId}`);
         } catch (error) {
            // console.error('Offline download failed:', error);

            // Retry logic
            if (retryCount < 3) {
               await this.scheduleOfflineDownload(userId, audiobookId, downloadId, _quality, retryCount + 1);
            } else {
               // Mark download as failed
               await runWrite(this.prisma, async (tx) =>
                  tx.offlineDownload.update({
                     where: { id: downloadId },
                     data: {
                        status: 'FAILED',
                        errorMessage: error instanceof Error ? error.message : 'Unknown error',
                     },
                  }),
               );
            }

            throw error;
         }
      });

      // Cleanup processor
      this.cleanupQueue.process('cleanup-data', async (job) => {
         const { type } = job.data;

         try {
            switch (type) {
               case 'inactive_sessions':
                  await this.cleanupInactiveSessions();
                  break;
               case 'expired_downloads':
                  await this.cleanupExpiredDownloads();
                  break;
               case 'old_progress_data':
                  await this.cleanupOldProgressData();
                  break;
               case 'user_deletion':
                  if (job.data.userId) {
                     await this.entityDeletionCleanup.cleanupUser(job.data.userId, job.data.authorId);
                  }
                  break;
               case 'author_deletion':
                  if (job.data.authorId && job.data.userId) {
                     await this.entityDeletionCleanup.cleanupAuthor(job.data.authorId, job.data.userId);
                  }
                  break;
               case 'organization_deletion':
                  if (job.data.organizationId) {
                     await this.entityDeletionCleanup.cleanupOrganization(job.data.organizationId);
                  }
                  break;
            }

            console.log(`Cleanup job completed: ${type}`);
         } catch (error) {
            // console.error('Cleanup job failed:', error);
            throw error;
         }
      });

      // Duration calculation processor
      this.durationQueue.process('calculate-duration', async (job) => {
         const { audiobookId } = job.data;

         try {
            await this.calculateAudiobookDuration(audiobookId);
            console.log(`Duration calculation completed for audiobook ${audiobookId}`);
         } catch (error) {
            throw error;
         }
      });

      // Scheduled activation processor
      this.activationQueue.process('activate-scheduled', async (job) => {
         const { type, id, waitAttempt = 0 } = job.data;

         try {
            if (type === 'audiobook') {
               await runWrite(this.prisma, async (tx) =>
                  tx.audioBook.update({
                     where: { id },
                     data: {
                        isActive: true,
                        scheduledAt: null,
                     },
                  }),
               );
               console.log(`Activated scheduled audiobook ${id}`);
            } else if (type === 'chapter') {
               const chapter = await this.prisma.chapter.findUnique({
                  where: { id },
                  select: { transcodingReady: true },
               });

               if (!chapter) {
                  console.warn(`Scheduled activation skipped — chapter ${id} not found`);
                  return;
               }

               if (!chapter.transcodingReady) {
                  const nextAttempt = waitAttempt + 1;
                  const maxWaitAttempts = 20;

                  if (nextAttempt >= maxWaitAttempts) {
                     console.warn(`Scheduled activation gave up waiting for transcoding on chapter ${id}`);
                     return;
                  }

                  await this.activationQueue.add(
                     'activate-scheduled',
                     { type, id, waitAttempt: nextAttempt },
                     {
                        jobId: `activation-chapter-${id}-wait-${nextAttempt}`,
                        delay: 30_000,
                        attempts: 1,
                     },
                  );
                  console.log(`Scheduled activation deferred for chapter ${id} — transcoding not ready (attempt ${nextAttempt})`);
                  return;
               }

               await runWrite(this.prisma, async (tx) =>
                  tx.chapter.update({
                     where: { id },
                     data: {
                        isActive: true,
                        scheduledAt: null,
                     },
                  }),
               );
               console.log(`Activated scheduled chapter ${id}`);
            }
         } catch (error) {
            // console.error('Scheduled activation failed:', error);
            throw error;
         }
      });
   }

   /**
    * Setup scheduled jobs
    */
   private setupScheduledJobs(): void {
      // Schedule progress calculation every 5 minutes
      this.progressQueue.add('calculate-progress', {
         userId: 'system',
         audiobookId: 'all',
         type: 'audiobook_progress'
      } as ProgressCalculationJobData, {
         repeat: { cron: '*/5 * * * *' },
         jobId: 'scheduled-progress-calculation',
      });

      // Schedule cleanup jobs
      this.cleanupQueue.add('cleanup-data', { type: 'inactive_sessions' } as CleanupJobData, {
         repeat: { cron: '0 */6 * * *' }, // Every 6 hours
         jobId: 'scheduled-cleanup-sessions',
      });

      this.cleanupQueue.add('cleanup-data', { type: 'expired_downloads' } as CleanupJobData, {
         repeat: { cron: '0 2 * * *' }, // Daily at 2 AM
         jobId: 'scheduled-cleanup-downloads',
      });

      this.cleanupQueue.add('cleanup-data', { type: 'old_progress_data' } as CleanupJobData, {
         repeat: { cron: '0 3 * * 0' }, // Weekly on Sunday at 3 AM
         jobId: 'scheduled-cleanup-progress',
      });
   }

   /**
    * Schedule entity deletion cleanup (user, author, or organization)
    */
   async scheduleEntityDeletion(data: CleanupJobData): Promise<void> {
      await this.cleanupQueue.add('cleanup-data', data, {
         attempts: 3,
         backoff: { type: 'exponential', delay: 5000 },
         removeOnComplete: true,
         removeOnFail: false,
      });
   }

   /**
    * Schedule audiobook progress calculation
    */
   async scheduleAudiobookProgressCalculation(userId: string, audiobookId: string): Promise<void> {
      try {
         await this.progressQueue.add('calculate-progress', {
            userId,
            audiobookId,
            type: 'audiobook_progress',
         }, {
            delay: 1000, // 1 second delay
            attempts: 3,
            backoff: {
               type: 'exponential',
               delay: 2000,
            },
         });
      } catch (error) {
         rethrowServiceError(error, { operation: 'scheduleAudiobookProgressCalculation' }, MessageHandler.getErrorMessage('internal.default'));
      }
   }

   /**
    * Schedule chapter progress calculation
    */
   async scheduleChapterProgressCalculation(userId: string, audiobookId: string): Promise<void> {
      try {
         await this.progressQueue.add('calculate-progress', {
            userId,
            audiobookId,
            type: 'chapter_progress',
         }, {
            delay: 500, // 0.5 second delay
            attempts: 3,
            backoff: {
               type: 'exponential',
               delay: 1000,
            },
         });
      } catch (error) {
         rethrowServiceError(error, { operation: 'scheduleChapterProgressCalculation' }, MessageHandler.getErrorMessage('internal.default'));
      }
   }

   /**
    * Schedule audiobook duration calculation
    * This job calculates the total duration of an audiobook by summing all chapter durations
    */
   async scheduleAudiobookDurationCalculation(audiobookId: string): Promise<void> {
      try {
         await this.durationQueue.add('calculate-duration', {
            audiobookId,
         }, {
            delay: 500, // 0.5 second delay
            attempts: 3,
            backoff: {
               type: 'exponential',
               delay: 1000,
            },
         });
      } catch (error) {
         rethrowServiceError(error, { operation: 'scheduleAudiobookDurationCalculation' }, MessageHandler.getErrorMessage('internal.default'));
      }
   }

   /**
    * Schedule activation job for audiobook or chapter
    * Creates a delayed job that will activate the item at the specified time
    */
   async scheduleActivationJob(type: 'audiobook' | 'chapter', id: string, scheduledAt: Date): Promise<void> {
      try {
         // Calculate delay in milliseconds
         const delay = scheduledAt.getTime() - Date.now();

         // If scheduled time is in the past, activate immediately
         if (delay <= 0) {
            if (type === 'audiobook') {
               await runWrite(this.prisma, async (tx) =>
                  tx.audioBook.update({
                     where: { id },
                     data: {
                        isActive: true,
                        scheduledAt: null,
                     },
                  }),
               );
            } else {
               const chapter = await this.prisma.chapter.findUnique({
                  where: { id },
                  select: { transcodingReady: true },
               });

               if (!chapter?.transcodingReady) {
                  await this.activationQueue.add(
                     'activate-scheduled',
                     { type, id, waitAttempt: 0 },
                     {
                        jobId: `activation-chapter-${id}-wait-0`,
                        delay: 30_000,
                        attempts: 1,
                     },
                  );
                  return;
               }

               await runWrite(this.prisma, async (tx) =>
                  tx.chapter.update({
                     where: { id },
                     data: {
                        isActive: true,
                        scheduledAt: null,
                     },
                  }),
               );
            }
            return;
         }

         // Create unique job ID to prevent duplicates
         const jobId = `activation-${type}-${id}`;

         // Remove any existing job with the same ID
         const existingJob = await this.activationQueue.getJob(jobId);
         if (existingJob) {
            await existingJob.remove();
         }

         // Schedule the activation job
         await this.activationQueue.add('activate-scheduled', {
            type,
            id,
         } as ScheduledActivationJobData, {
            jobId,
            delay,
            attempts: 1, // Only attempt once
         });
      } catch (error) {
         rethrowServiceError(error, { operation: 'scheduleActivationJob' }, MessageHandler.getErrorMessage('internal.default'));
      }
   }

   /**
    * Calculate audiobook duration by summing all chapter durations
    */
   private async calculateAudiobookDuration(audiobookId: string): Promise<void> {
      try {
         // Verify audiobook exists
         const audiobook = await this.prisma.audioBook.findUnique({
            where: { id: audiobookId },
         });

         if (!audiobook) {
            console.warn(`Audiobook with ID ${audiobookId} not found, skipping duration calculation`);
            return;
         }

         // Get all chapters for this audiobook and sum their durations
         const chapters = await this.prisma.chapter.findMany({
            where: { audiobookId },
            select: { duration: true },
         });

         // Calculate total duration by summing all chapter durations
         const totalDuration = chapters.reduce((sum, chapter) => sum + (chapter.duration ?? 0), 0);

         // Update audiobook duration
         await runWrite(this.prisma, async (tx) =>
            tx.audioBook.update({
               where: { id: audiobookId },
               data: { duration: totalDuration },
            }),
         );

         console.log(`Updated audiobook ${audiobookId} duration to ${totalDuration} seconds`);
      } catch (error) {
         // console.error('Failed to calculate audiobook duration:', error);
         throw error;
      }
   }

   /**
    * Schedule offline download
    */
   async scheduleOfflineDownload(
      userId: string,
      audiobookId: string,
      downloadId: string,
      quality?: 'high' | 'medium' | 'low',
      retryCount: number = 0
   ): Promise<void> {
      try {
         await this.downloadQueue.add('download-audiobook', {
            userId,
            audiobookId,
            downloadId,
            quality: quality || 'medium',
            retryCount,
         }, {
            delay: retryCount > 0 ? retryCount * 5000 : 0, // Exponential backoff for retries
            attempts: 1, // We handle retries manually
         });
      } catch (error) {
         rethrowServiceError(error, { operation: 'scheduleOfflineDownload' }, MessageHandler.getErrorMessage('internal.default'));
      }
   }


   /**
    * Validate if a string is a valid UUID
    */
   // private isValidUUID(uuid: string): boolean {
   //    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
   //    return uuidRegex.test(uuid);
   // }

   /**
    * Calculate progress for all audiobooks for all users
    */
   private async calculateAllAudiobookProgress(): Promise<void> {
      try {
         // Get all audiobooks
         const audiobooks = await this.prisma.audioBook.findMany({
            select: { id: true },
         });

         // Get all users who have listening history
         const users = await this.prisma.listeningHistory.findMany({
            select: { userId: true },
            distinct: ['userId'],
         });

         console.log(`Calculating progress for ${audiobooks.length} audiobooks and ${users.length} users`);

         // Calculate progress for each user-audiobook combination
         for (const user of users) {
            for (const audiobook of audiobooks) {
               try {
                  await this.calculateAudiobookProgress(user.userId, audiobook.id);
               } catch (_error) {
                  // console.error(`Failed to calculate progress for user ${user.userId}, audiobook ${audiobook.id}:`, _error);
                  // Continue with other combinations even if one fails
               }
            }
         }

         console.log('Completed calculating progress for all audiobooks and users');
      } catch (error) {
         // console.error('Failed to calculate all audiobook progress:', error);
         throw error;
      }
   }

   /**
    * Calculate audiobook progress
    */
   private async calculateAudiobookProgress(userId: string, audiobookId: string): Promise<void> {
      try {
         // Verify audiobook exists
         const audiobook = await this.prisma.audioBook.findUnique({
            where: { id: audiobookId },
         });

         if (!audiobook) {
            console.warn(`Audiobook with ID ${audiobookId} not found, skipping progress calculation`);
            return;
         }

         const progressSeconds = await this.chapterService.calculateAudiobookProgress(
            userId,
            audiobookId
         );
         const existingUserAudioBook = await this.prisma.userAudioBook.findUnique({
            where: {
               userId_audiobookId: { userId, audiobookId },
            },
            select: { progress: true },
         });
         const storedProgress = existingUserAudioBook
            ? Math.max(existingUserAudioBook.progress, progressSeconds)
            : progressSeconds;

         const totalDurationSeconds = await this.chapterService.getAudiobookTotalDurationSeconds(audiobookId);
         const completed =
            totalDurationSeconds > 0 && storedProgress >= totalDurationSeconds * 0.95;

         const existingListeningHistory = await this.prisma.listeningHistory.findUnique({
            where: {
               userId_audiobookId: { userId, audiobookId },
            },
            select: { currentPosition: true, completed: true },
         });
         const storedPosition = existingListeningHistory
            ? Math.max(existingListeningHistory.currentPosition, progressSeconds)
            : progressSeconds;
         const listeningCompleted =
            existingListeningHistory?.completed === true || completed;

         await runInTransaction(this.prisma, async (tx) => {
            await tx.userAudioBook.upsert({
               where: {
                  userId_audiobookId: {
                     userId,
                     audiobookId
                  }
               },
               update: {
                  progress: storedProgress
               },
               create: {
                  userId,
                  audiobookId,
                  type: UserAudioBookType.PURCHASED,
                  progress: storedProgress
               }
            });

            await tx.listeningHistory.upsert({
               where: {
                  userId_audiobookId: {
                     userId,
                     audiobookId,
                  },
               },
               update: {
                  currentPosition: storedPosition,
                  completed: listeningCompleted,
               },
               create: {
                  userId,
                  audiobookId,
                  currentPosition: storedPosition,
                  completed: listeningCompleted,
               },
            });
         });
      } catch (error) {
         // console.error('Failed to calculate audiobook progress:', error);
         throw error;
      }
   }

   /**
    * Calculate chapter progress
    */
   private async calculateChapterProgress(userId: string, audiobookId: string): Promise<void> {
      try {
         const chaptersWithProgress = await this.chapterService.getChaptersWithProgress(userId, audiobookId);

         await runInTransaction(this.prisma, async (tx) => {
            for (const chapter of chaptersWithProgress) {
               if (chapter.overallProgress && chapter.overallProgress >= 95) {
                  await tx.chapterProgress.updateMany({
                     where: {
                        userId,
                        chapterId: chapter.id,
                     },
                     data: {
                        completed: true,
                     },
                  });
               }
            }
         });
      } catch (error) {
         // console.error('Failed to calculate chapter progress:', error);
         throw error;
      }
   }

   /**
    * Process offline download
    */
   private async processOfflineDownload(
      userId: string,
      audiobookId: string,
      downloadId: string,
      _quality?: 'high' | 'medium' | 'low'
   ): Promise<void> {
      try {
         // Update download status to in progress
         await runWrite(this.prisma, async (tx) =>
            tx.offlineDownload.update({
               where: { id: downloadId },
               data: {
                  status: 'IN_PROGRESS',
                  progress: 0,
               },
            }),
         );

         // Get audiobook details
         const audiobook = await this.prisma.audioBook.findUnique({
            where: { id: audiobookId },
         });

         if (!audiobook) {
            throw new Error('Audiobook not found');
         }

         // Simulate download process (in real implementation, this would handle actual file download)
         const totalSize = Number(audiobook.fileSize);
         let downloadedSize = 0;
         const chunkSize = Math.floor(totalSize / 100); // Simulate progress in chunks

         while (downloadedSize < totalSize) {
            downloadedSize += chunkSize;
            const progress = Math.min((downloadedSize / totalSize) * 100, 100);

            await runWrite(this.prisma, async (tx) =>
               tx.offlineDownload.update({
                  where: { id: downloadId },
                  data: { progress },
               }),
            );

            // Simulate download time
            await new Promise(resolve => setTimeout(resolve, 100));
         }

         // Mark download as completed
         await runWrite(this.prisma, async (tx) =>
            tx.offlineDownload.update({
               where: { id: downloadId },
               data: {
                  status: 'COMPLETED',
                  progress: 100,
                  filePath: `/downloads/${userId}/${audiobookId}.mp3`,
                  fileSize: audiobook.fileSize,
                  completedAt: new Date(),
               },
            }),
         );
      } catch (error) {
         // console.error('Failed to process offline download:', error);
         throw error;
      }
   }

   /**
    * Cleanup inactive sessions
    */
   private async cleanupInactiveSessions(): Promise<void> {
      // This would clean up inactive playback sessions
      // Implementation depends on how sessions are stored
      console.log('Cleaning up inactive sessions...');
   }

   /**
    * Cleanup expired downloads
    */
   private async cleanupExpiredDownloads(): Promise<void> {
      try {
         const expiredDate = new Date();
         expiredDate.setDate(expiredDate.getDate() - 30); // 30 days ago

         const expiredDownloads = await this.prisma.offlineDownload.findMany({
            where: {
               status: 'COMPLETED',
               completedAt: {
                  lt: expiredDate,
               },
            },
         });

         for (const download of expiredDownloads) {
            await runWrite(this.prisma, async (tx) =>
               tx.offlineDownload.delete({
                  where: { id: download.id },
               }),
            );
         }

         console.log(`Cleaned up ${expiredDownloads.length} expired downloads`);
      } catch (_error) {
         // console.error('Failed to cleanup expired downloads:', _error);
      }
   }

   /**
    * Cleanup old progress data
    */
   private async cleanupOldProgressData(): Promise<void> {
      try {
         const oldDate = new Date();
         oldDate.setMonth(oldDate.getMonth() - 6); // 6 months ago

         // Clean up old chapter progress for completed chapters
         const deletedProgress = await runWrite(this.prisma, async (tx) =>
            tx.chapterProgress.deleteMany({
               where: {
                  completed: true,
                  updatedAt: {
                     lt: oldDate,
                  },
               },
            }),
         );

         console.log(`Cleaned up ${deletedProgress.count} old progress records`);
      } catch (_error) {
         // console.error('Failed to cleanup old progress data:', _error);
      }
   }

   /**
    * Get queue statistics
    */
   async getQueueStats(): Promise<{
      progressQueue: any;
      downloadQueue: any;
      cleanupQueue: any;
      durationQueue: any;
      activationQueue: any;
   }> {
      try {
         const [
            progressStats,
            downloadStats,
            cleanupStats,
            durationStats,
            activationStats,
         ] = await Promise.all([
            this.progressQueue.getJobCounts(),
            this.downloadQueue.getJobCounts(),
            this.cleanupQueue.getJobCounts(),
            this.durationQueue.getJobCounts(),
            this.activationQueue.getJobCounts(),
         ]);

         return {
            progressQueue: progressStats,
            downloadQueue: downloadStats,
            cleanupQueue: cleanupStats,
            durationQueue: durationStats,
            activationQueue: activationStats,
         };
      } catch (error) {
         rethrowServiceError(error, { operation: 'getQueueStats' }, MessageHandler.getErrorMessage('internal.default'));
      }
   }

   /**
    * Graceful shutdown
    */
   async shutdown(): Promise<void> {
      try {
         await Promise.all([
            this.progressQueue.close(),
            this.downloadQueue.close(),
            this.cleanupQueue.close(),
            this.durationQueue.close(),
            this.activationQueue.close(),
         ]);
      } catch (_error) {
         // console.error('Error during queue shutdown:', _error);
      }
   }
}
