/**
 * Chapter Service
 * Handles business logic for chapter management
 */
import { PrismaClient, SubscriptionGatingMode, SubscriptionTierLevel, AudiobookType, Page as PrismaPage } from '@prisma/client';
import {
   ChapterData,
   ChapterWithRelations,
   CreateChapterRequest,
   UpdateChapterRequest,
   ChapterQueryParams,
   ChapterWithProgress,
   ChapterNavigation,
   ChapterProgressData,
   UpdateChapterProgressRequest
} from '../models/ChapterDto';
import { ApiError } from '../types/ApiError';
import { RabbitMQFactory, TranscodingJobData } from '../config/rabbitmq';
import { config } from '../config/env';
import { FileUploadService } from './FileUploadService';
import { BackgroundJobService } from './BackgroundJobService';
import { ImageAssetService } from './ImageAssetService';
import { fileUrlService } from './FileUrlService';
import { mediaCleanupService } from './MediaCleanupService';
import { emitCacheInvalidation } from './DomainEventPublisher';
import { emitChapterSubscriptionTierInvalidation } from './chapterSubscriptionTierInvalidation';
import {
   resolveChapterTierForCreate,
   resolveChapterTierForUpdate,
} from '../utils/subscriptionGatingValidation';
import { SubscriptionAccessService, subscriptionAccessService } from './SubscriptionAccessService';
import { SubscriptionAccessDto } from '../models/SubscriptionAccessDto';
import { runWrite } from '../utils/prismaTransaction';
import { rethrowServiceError, logServiceError } from '../utils/serviceError';
import { MessageHandler } from '../utils/MessageHandler';
import { ChapterTranscodingCompletedMessage } from '../types/chapter-events';
import {
   assertAuthoringChapterRequiresPages,
   assertAuthoringChapterTierForbidden,
   assertPublicationChapterRequiresAudio,
   assertPublicationChapterRequiresCover,
   validatePageInputs,
} from '../utils/audiobookTypeValidation';
import { toPageDto } from '../models/PageDto';
import { runInTransaction } from '../utils/prismaTransaction';

export class ChapterService {
   private fileUploadService: FileUploadService;
   private backgroundJobService: BackgroundJobService | undefined;
   private imageAssetService: ImageAssetService;
   private subscriptionAccessService: SubscriptionAccessService;

   constructor(
      private prisma: PrismaClient,
      backgroundJobService?: BackgroundJobService,
      subscriptionAccessServiceInstance: SubscriptionAccessService = subscriptionAccessService,
   ) {
      this.fileUploadService = new FileUploadService();
      this.backgroundJobService = backgroundJobService;
      this.imageAssetService = new ImageAssetService(prisma);
      this.subscriptionAccessService = subscriptionAccessServiceInstance;
   }

   async getSubscriptionAccessForChapter(
      chapter: { minSubscriptionTier: SubscriptionTierLevel | null },
      audiobook: { subscriptionGatingMode: SubscriptionGatingMode; minSubscriptionTier: SubscriptionTierLevel | null },
      userId: string | null,
      accessToken: string | null,
      userRole?: string | null,
   ): Promise<SubscriptionAccessDto> {
      const requiredTier = this.subscriptionAccessService.resolveChapterRequiredTier(audiobook, chapter);
      return this.subscriptionAccessService.evaluateAccess(
         requiredTier,
         userId,
         accessToken,
         userRole,
         'chapter',
      );
   }

   /**
    * Resolve the minimum subscription tier required to stream a chapter.
    * Used by streaming-service for LISTENER subscription gating.
    */
   async getChapterRequiredTierForStream(chapterId: string): Promise<SubscriptionTierLevel | null> {
      const chapter = await this.prisma.chapter.findUnique({
         where: { id: chapterId },
         select: {
            minSubscriptionTier: true,
            audiobook: {
               select: {
                  subscriptionGatingMode: true,
                  minSubscriptionTier: true,
               },
            },
         },
      });

      if (!chapter) {
         throw ApiError.notFound('Chapter');
      }

      return this.subscriptionAccessService.resolveChapterRequiredTier(
         chapter.audiobook,
         { minSubscriptionTier: chapter.minSubscriptionTier },
      );
   }

   /**
    * Get all chapters for a specific audiobook
    */
   async getChaptersByAudiobookId(audiobookId: string, queryParams?: ChapterQueryParams): Promise<{
      chapters: ChapterWithRelations[];
      totalCount: number;
   }> {
      try {
         const { page = 1, limit = 50, sortBy = 'chapterNumber', sortOrder = 'asc' } = queryParams || {};
         const skip = (page - 1) * limit;

         const [chapters, totalCount] = await Promise.all([
            this.prisma.chapter.findMany({
               where: {
                  audiobookId,
                  ...(queryParams?.activeOnly ? { isActive: true } : {}),
               },
               include: {
                  audiobook: {
                     select: {
                        id: true,
                        title: true,
                        author: true,
                     },
                  },
                  pages: {
                     orderBy: { pageNumber: 'asc' },
                  },
                  chapterProgress: true,
                  bookmarks: true,
                  notes: true,
               },
               orderBy: { [sortBy]: sortOrder },
               skip,
               take: limit,
            }),
            this.prisma.chapter.count({
               where: {
                  audiobookId,
                  ...(queryParams?.activeOnly ? { isActive: true } : {}),
               },
            }),
         ]);

         return {
            chapters: await fileUrlService.resolveChapterMediaList(
               chapters.map(chapter => this.mapChapterRecord(chapter))
            ),
            totalCount
         };
      } catch (error) {
         rethrowServiceError(error, { operation: 'getChaptersByAudiobookId' }, MessageHandler.getErrorMessage('internal.default'));
      }
   }

   /**
    * Get a specific chapter by ID
    */
   async getChapterById(chapterId: string): Promise<ChapterWithRelations> {
      try {
         const chapter = await this.prisma.chapter.findUnique({
            where: { id: chapterId },
            include: {
               audiobook: {
                  select: {
                     id: true,
                     title: true,
                     author: true,
                  },
               },
               pages: {
                  orderBy: { pageNumber: 'asc' },
               },
               chapterProgress: true,
               bookmarks: true,
               notes: true,
            },
         });

         if (!chapter) {
            throw new ApiError('Chapter not found', 404);
         }

         return fileUrlService.resolveChapterMedia(this.mapChapterRecord(chapter));
      } catch (error) {
         if (error instanceof ApiError) {
            throw error;
         }
         throw new ApiError('Failed to retrieve chapter', 500);
      }
   }

   /**
    * Create a new chapter
    */
   async createChapter(
      chapterData: CreateChapterRequest,
      uploadedFile?: Express.Multer.File,
      uploadedCoverImage?: Express.Multer.File
   ): Promise<ChapterData> {
      try {
         const audiobook = await this.prisma.audioBook.findUnique({
            where: { id: chapterData.audiobookId },
         });

         if (!audiobook) {
            throw new ApiError('Audiobook not found', 404);
         }

         if (audiobook.type === AudiobookType.AUTHORING) {
            return this.createAuthoringChapter(chapterData, uploadedCoverImage);
         }

         return this.createPublicationChapter(chapterData, uploadedFile, uploadedCoverImage);
      } catch (error) {
         if (error instanceof ApiError) {
            throw error;
         }
         throw new ApiError('Failed to create chapter', 500);
      }
   }

   private async createAuthoringChapter(
      chapterData: CreateChapterRequest,
      uploadedCoverImage?: Express.Multer.File,
   ): Promise<ChapterData> {
      assertAuthoringChapterTierForbidden(chapterData.minSubscriptionTier);
      assertAuthoringChapterRequiresPages(chapterData.pages);
      validatePageInputs(chapterData.pages!);

      const existingChapter = await this.prisma.chapter.findFirst({
         where: {
            audiobookId: chapterData.audiobookId,
            chapterNumber: chapterData.chapterNumber,
         },
      });

      if (existingChapter) {
         throw new ApiError('Chapter number already exists for this audiobook', 400);
      }

      let coverImage: string | null | undefined = chapterData.coverImage;
      let coverImagePath: string | undefined;

      if (uploadedCoverImage) {
         coverImagePath = uploadedCoverImage.path;
         coverImage = coverImage ?? 'pending';
      }

      const isScheduled = chapterData.scheduledAt !== undefined;

      let chapter = await runInTransaction(this.prisma, async (tx) => {
         const created = await tx.chapter.create({
            data: {
               audiobookId: chapterData.audiobookId,
               title: chapterData.title,
               description: chapterData.description ?? null,
               chapterNumber: chapterData.chapterNumber,
               coverImage: coverImage ?? null,
               minSubscriptionTier: null,
               duration: null,
               filePath: null,
               fileSize: null,
               startPosition: null,
               endPosition: null,
               sourceUploadStatus: 'ready',
               transcodingReady: true,
               isActive: !isScheduled,
               ...(isScheduled ? { scheduledAt: chapterData.scheduledAt } : {}),
            },
         });

         await tx.page.createMany({
            data: chapterData.pages!.map((page) => ({
               chapterId: created.id,
               pageNumber: page.pageNumber,
               plainText: page.plainText.trim(),
               richText: page.richText as object,
            })),
         });

         return created;
      });

      if (coverImagePath) {
         try {
            const { primaryStorageKey } = await this.imageAssetService.generateAndStoreVariants(
               'chapter',
               chapter.id,
               coverImagePath,
            );
            chapter = await runWrite(this.prisma, async (tx) =>
               tx.chapter.update({
                  where: { id: chapter.id },
                  data: { coverImage: primaryStorageKey },
               }),
            );
         } catch (variantError: unknown) {
            await runWrite(this.prisma, async (tx) => tx.chapter.delete({ where: { id: chapter.id } }));
            const message = variantError instanceof Error ? variantError.message : 'Invalid chapter cover image';
            throw new ApiError(message, 400);
         }
      }

      if (isScheduled && this.backgroundJobService) {
         try {
            await this.backgroundJobService.scheduleActivationJob('chapter', chapter.id, chapterData.scheduledAt!);
         } catch (error) {
            logServiceError(error, { operation: 'createAuthoringChapter.scheduleActivation' });
         }
      }

      emitCacheInvalidation('chapter', 'created', chapter.id, { audiobookId: chapterData.audiobookId });

      const chapterWithPages = await this.prisma.chapter.findUnique({
         where: { id: chapter.id },
         include: { pages: { orderBy: { pageNumber: 'asc' } } },
      });

      return fileUrlService.resolveChapterMedia(this.mapChapterRecord(chapterWithPages!));
   }

   private async createPublicationChapter(
      chapterData: CreateChapterRequest,
      uploadedFile?: Express.Multer.File,
      uploadedCoverImage?: Express.Multer.File,
   ): Promise<ChapterData> {
      assertPublicationChapterRequiresAudio(Boolean(uploadedFile || chapterData.filePath));

      const chapterTier = await resolveChapterTierForCreate(
         this.prisma,
         chapterData.audiobookId,
         chapterData.chapterNumber,
         chapterData.minSubscriptionTier,
      );

      if (
         chapterData.duration === undefined ||
         chapterData.startPosition === undefined ||
         chapterData.endPosition === undefined
      ) {
         throw new ApiError('Duration, start position, and end position are required for publication chapters', 400);
      }

      // Check if chapter number already exists for this audiobook
      const existingChapter = await this.prisma.chapter.findFirst({
         where: {
            audiobookId: chapterData.audiobookId,
            chapterNumber: chapterData.chapterNumber,
         },
      });

      if (existingChapter) {
         throw new ApiError('Chapter number already exists for this audiobook', 400);
      }

      // Defer audio upload until after DB commit when a new file is attached
      const filePath = chapterData.filePath || '';
      const fileSize = chapterData.fileSize || 0;
      const hasAudioUpload = Boolean(uploadedFile);

      // Handle coverImage - required via upload or chapterData
      let coverImage = chapterData.coverImage;
      let coverImagePath: string | undefined;

      if (uploadedCoverImage) {
         coverImagePath = uploadedCoverImage.path;
         coverImage = coverImage ?? 'pending';
      }

      assertPublicationChapterRequiresCover(Boolean(coverImage));

      const createData: any = {
         audiobookId: chapterData.audiobookId,
         title: chapterData.title,
         description: chapterData.description,
         chapterNumber: chapterData.chapterNumber,
         duration: chapterData.duration,
         startPosition: chapterData.startPosition,
         endPosition: chapterData.endPosition,
         minSubscriptionTier: chapterTier,
         filePath: hasAudioUpload ? '' : filePath,
         fileSize: BigInt(hasAudioUpload ? 0 : fileSize),
         coverImage,
         sourceUploadStatus: hasAudioUpload ? 'pending' : (filePath ? 'ready' : 'pending'),
         isActive: false,
         transcodingReady: false,
      };

      if (chapterData.scheduledAt !== undefined) {
         createData.scheduledAt = chapterData.scheduledAt;
      }

      let chapter = await runWrite(this.prisma, async (tx) =>
         tx.chapter.create({
            data: createData,
         }),
      );

      if (coverImagePath) {
         try {
            const { primaryStorageKey } = await this.imageAssetService.generateAndStoreVariants(
               'chapter',
               chapter.id,
               coverImagePath,
            );
            chapter = await runWrite(this.prisma, async (tx) =>
               tx.chapter.update({
                  where: { id: chapter.id },
                  data: { coverImage: primaryStorageKey },
               }),
            );
         } catch (variantError: unknown) {
            await runWrite(this.prisma, async (tx) => tx.chapter.delete({ where: { id: chapter.id } }));
            const message = variantError instanceof Error ? variantError.message : 'Invalid chapter cover image';
            throw new ApiError(message, 400);
         }
      }

      if (hasAudioUpload && uploadedFile) {
         try {
            const uploadResult = await this.fileUploadService.uploadFile(
               uploadedFile,
               '/uploads/chapters'
            );
            chapter = await runWrite(this.prisma, async (tx) =>
               tx.chapter.update({
                  where: { id: chapter.id },
                  data: {
                     filePath: uploadResult.filePath,
                     fileSize: BigInt(uploadResult.fileSize),
                     sourceUploadStatus: 'ready',
                     sourceUploadError: null,
                  },
               }),
            );
         } catch (uploadError: unknown) {
            const message = uploadError instanceof Error ? uploadError.message : 'Upload failed';
            await runWrite(this.prisma, async (tx) =>
               tx.chapter.update({
                  where: { id: chapter.id },
                  data: {
                     sourceUploadStatus: 'failed',
                     sourceUploadError: message,
                  },
               }),
            );
            throw new ApiError(`Failed to upload chapter audio: ${message}`, 500);
         }
      }

      if (chapter.sourceUploadStatus === 'ready' && chapter.filePath) {
         await this.publishChapterTranscodingJob(chapter);
      }

      // Schedule audiobook duration calculation job
      if (this.backgroundJobService) {
         try {
            await this.backgroundJobService.scheduleAudiobookDurationCalculation(chapter.audiobookId);
         } catch (error) {
            logServiceError(error, { operation: 'createChapter.scheduleDuration' });
         }

         if (chapterData.scheduledAt !== undefined) {
            try {
               await this.backgroundJobService.scheduleActivationJob('chapter', chapter.id, chapterData.scheduledAt);
            } catch (error) {
               logServiceError(error, { operation: 'createChapter.scheduleActivation' });
            }
         }
      }

      emitCacheInvalidation('chapter', 'created', chapter.id, { audiobookId: chapterData.audiobookId });
      if (chapterTier !== null) {
         emitChapterSubscriptionTierInvalidation({
            action: 'created',
            chapterId: chapter.id,
            audiobookId: chapterData.audiobookId,
         });
      }
      return fileUrlService.resolveChapterMedia(this.mapChapterData(chapter));
   }

   /**
    * Update an existing chapter
    */
   async updateChapter(
      chapterId: string,
      updateData: UpdateChapterRequest,
      uploadedFile?: Express.Multer.File,
      uploadedCoverImage?: Express.Multer.File
   ): Promise<ChapterData> {
      try {
         const existingChapter = await this.prisma.chapter.findUnique({
            where: { id: chapterId },
            include: {
               audiobook: {
                  select: { type: true },
               },
            },
         });

         if (!existingChapter) {
            throw new ApiError('Chapter not found', 404);
         }

         const isAuthoring = existingChapter.audiobook.type === AudiobookType.AUTHORING;

         if (isAuthoring) {
            assertAuthoringChapterTierForbidden(updateData.minSubscriptionTier);
            if (uploadedFile) {
               throw new ApiError('Audio upload is not allowed for authoring chapters', 400);
            }
            if (
               updateData.duration !== undefined ||
               updateData.startPosition !== undefined ||
               updateData.endPosition !== undefined ||
               updateData.filePath !== undefined ||
               updateData.fileSize !== undefined
            ) {
               throw new ApiError('Audio fields cannot be updated on authoring chapters', 400);
            }
         }

         // Validate: Cannot schedule an active chapter
         if (updateData.scheduledAt !== undefined && existingChapter.isActive) {
            throw new ApiError('Active chapter cannot be scheduled', 400);
         }

         // If updating chapter number, check for conflicts
         if (updateData.chapterNumber && updateData.chapterNumber !== existingChapter.chapterNumber) {
            const conflictingChapter = await this.prisma.chapter.findFirst({
               where: {
                  audiobookId: existingChapter.audiobookId,
                  chapterNumber: updateData.chapterNumber,
                  id: { not: chapterId },
               },
            });

            if (conflictingChapter) {
               throw new ApiError('Chapter number already exists for this audiobook', 400);
            }
         }

         // Defer audio upload until after DB commit when replacing audio
         const filePath = updateData.filePath;
         const fileSize = updateData.fileSize;
         const hasAudioUpload = Boolean(uploadedFile);
         const oldFilePath = existingChapter.filePath;

         // Handle coverImage upload if provided
         let coverImage: string | null | undefined = updateData.coverImage;
         let coverImagePath: string | undefined;

         if (uploadedCoverImage) {
            coverImagePath = uploadedCoverImage.path;
         }

         if (coverImage === undefined) {
            coverImage = existingChapter.coverImage;
         }

         const updatePayload: any = { ...updateData };
         delete updatePayload.minSubscriptionTier;
         if (filePath !== undefined) {
            updatePayload.filePath = filePath;
         }
         if (fileSize !== undefined) {
            updatePayload.fileSize = BigInt(fileSize);
         }
         if (coverImage !== undefined && !coverImagePath) {
            updatePayload.coverImage = coverImage;
         } else if (coverImagePath) {
            delete updatePayload.coverImage;
         }

         if (hasAudioUpload) {
            updatePayload.sourceUploadStatus = 'pending';
            updatePayload.sourceUploadError = null;
            updatePayload.isActive = false;
            updatePayload.transcodingReady = false;
         }

         // Handle scheduledAt: if provided, set isActive=false
         if (updateData.scheduledAt !== undefined) {
            updatePayload.isActive = false;
         }

         const tierUpdateInput: {
            chapterNumber?: number;
            minSubscriptionTier?: SubscriptionTierLevel | null;
         } = {};
         if (updateData.chapterNumber !== undefined) {
            tierUpdateInput.chapterNumber = updateData.chapterNumber;
         }
         if (!isAuthoring && updateData.minSubscriptionTier !== undefined) {
            tierUpdateInput.minSubscriptionTier = updateData.minSubscriptionTier;
         }

         let resolvedGating: Awaited<ReturnType<typeof resolveChapterTierForUpdate>> = {};
         if (!isAuthoring) {
            resolvedGating = await resolveChapterTierForUpdate(
               this.prisma,
               existingChapter.audiobookId,
               chapterId,
               {
                  chapterNumber: existingChapter.chapterNumber,
                  minSubscriptionTier: existingChapter.minSubscriptionTier,
               },
               tierUpdateInput,
            );
            if (resolvedGating.minSubscriptionTier !== undefined) {
               updatePayload.minSubscriptionTier = resolvedGating.minSubscriptionTier;
            }
            if (resolvedGating.chapterNumber !== undefined) {
               updatePayload.chapterNumber = resolvedGating.chapterNumber;
            }
         } else if (updateData.chapterNumber !== undefined) {
            updatePayload.chapterNumber = updateData.chapterNumber;
         }

         let chapter = await runWrite(this.prisma, async (tx) =>
            tx.chapter.update({
               where: { id: chapterId },
               data: updatePayload,
            }),
         );

         if (!isAuthoring && hasAudioUpload && uploadedFile) {
            try {
               const uploadResult = await this.fileUploadService.uploadFile(
                  uploadedFile,
                  '/uploads/chapters'
               );
               chapter = await runWrite(this.prisma, async (tx) =>
                  tx.chapter.update({
                     where: { id: chapterId },
                     data: {
                        filePath: uploadResult.filePath,
                        fileSize: BigInt(uploadResult.fileSize),
                        sourceUploadStatus: 'ready',
                        sourceUploadError: null,
                     },
                  }),
               );

               if (oldFilePath && oldFilePath !== chapter.filePath) {
                  await this.fileUploadService.deleteFile(oldFilePath);
               }

               await this.publishChapterTranscodingJob(chapter, { forceRetranscode: true });
            } catch (uploadError: unknown) {
               const message = uploadError instanceof Error ? uploadError.message : 'Upload failed';
               chapter = await runWrite(this.prisma, async (tx) =>
                  tx.chapter.update({
                     where: { id: chapterId },
                     data: {
                        sourceUploadStatus: 'failed',
                        sourceUploadError: message,
                     },
                  }),
               );
               throw new ApiError(`Failed to upload chapter audio: ${message}`, 500);
            }
         }

         if (coverImagePath) {
            const { primaryStorageKey } = await this.imageAssetService.generateAndStoreVariants(
               'chapter',
               chapterId,
               coverImagePath,
            );
            chapter = await runWrite(this.prisma, async (tx) =>
               tx.chapter.update({
                  where: { id: chapterId },
                  data: { coverImage: primaryStorageKey },
               }),
            );
         }

         // Schedule activation job if scheduledAt was provided
         if (updateData.scheduledAt !== undefined && this.backgroundJobService) {
            try {
               await this.backgroundJobService.scheduleActivationJob('chapter', chapterId, updateData.scheduledAt);
            } catch (_error) {
               // Log error but don't fail chapter update
               console.error(`Error scheduling activation job for chapter ${chapterId}:`, _error);
            }
         }

         // Schedule audiobook duration calculation job if duration was updated
         if (this.backgroundJobService && (updateData.duration !== undefined)) {
            try {
               await this.backgroundJobService.scheduleAudiobookDurationCalculation(chapter.audiobookId);
            } catch (_error) {
               // Log error but don't fail chapter update
               console.error(`Error scheduling duration calculation for audiobook ${chapter.audiobookId}:`, _error);
            }
         }

         emitCacheInvalidation('chapter', 'updated', chapterId, { audiobookId: existingChapter.audiobookId });
         if (
            !isAuthoring &&
            resolvedGating.minSubscriptionTier !== undefined &&
            resolvedGating.minSubscriptionTier !== existingChapter.minSubscriptionTier
         ) {
            emitChapterSubscriptionTierInvalidation({
               action: 'updated',
               chapterId,
               audiobookId: existingChapter.audiobookId,
            });
         }
         return fileUrlService.resolveChapterMedia(this.mapChapterData(chapter));
      } catch (error) {
         if (error instanceof ApiError) {
            throw error;
         }
         throw new ApiError('Failed to update chapter', 500);
      }
   }

   /**
    * Delete a chapter
    */
   async deleteChapter(chapterId: string): Promise<void> {
      try {
         const chapter = await this.prisma.chapter.findUnique({
            where: { id: chapterId },
         });

         if (!chapter) {
            throw new ApiError('Chapter not found', 404);
         }

         const audiobookId = chapter.audiobookId;

         await this.imageAssetService.deleteAssetsForEntity('chapter', chapterId);
         await mediaCleanupService.deleteStoredFile(chapter.coverImage);
         await mediaCleanupService.deleteStoredFile(chapter.filePath);

         await runWrite(this.prisma, async (tx) =>
            tx.chapter.delete({
               where: { id: chapterId },
            }),
         );

         // Publish chapter deletion event to RabbitMQ
         try {
            const rabbitMQ = RabbitMQFactory.getConnection();
            const published = await rabbitMQ.publishChapterDeletion(chapterId);

            if (published) {
               console.log(`Chapter deletion event published for chapter ${chapterId}`);
            } else {
               console.error(`Failed to publish chapter deletion event for chapter ${chapterId}`);
            }
         } catch (_error) {
            // Log error but don't fail chapter deletion
            console.error(`Error publishing chapter deletion event for chapter ${chapterId}:`, _error);
         }

         // Schedule audiobook duration calculation job after deletion
         if (this.backgroundJobService) {
            try {
               await this.backgroundJobService.scheduleAudiobookDurationCalculation(audiobookId);
            } catch (_error) {
               // Log error but don't fail chapter deletion
               console.error(`Error scheduling duration calculation for audiobook ${audiobookId}:`, _error);
            }
         }

         emitCacheInvalidation('chapter', 'deleted', chapterId, { audiobookId });
      } catch (error) {
         if (error instanceof ApiError) {
            throw error;
         }
         throw new ApiError('Failed to delete chapter', 500);
      }
   }

   /**
    * Get chapter progress for a user
    */
   async getChapterProgress(userProfileId: string, chapterId: string): Promise<ChapterProgressData | null> {
      try {
         const progress = await this.prisma.chapterProgress.findUnique({
            where: {
               userProfileId_chapterId: {
                  userProfileId,
                  chapterId,
               },
            },
         });

         return progress;
      } catch (error) {
         if (error instanceof ApiError) {
            throw error;
         }
         rethrowServiceError(error, { operation: 'getChapterProgress' }, MessageHandler.getErrorMessage('internal.default'));
      }
   }

   /**
    * Update chapter progress for a user
    */
   async updateChapterProgress(
      userProfileId: string,
      chapterId: string,
      progressData: UpdateChapterProgressRequest
   ): Promise<ChapterProgressData> {
      try {
         // Verify chapter exists
         const chapter = await this.prisma.chapter.findUnique({
            where: { id: chapterId },
         });

         if (!chapter) {
            throw new ApiError('Chapter not found', 404);
         }

         // Validate position is within chapter duration
         if (chapter.duration != null && progressData.currentPosition > chapter.duration) {
            throw new ApiError('Position cannot exceed chapter duration', 400);
         }

         const progress = await runWrite(this.prisma, async (tx) =>
            tx.chapterProgress.upsert({
               where: {
                  userProfileId_chapterId: {
                     userProfileId,
                     chapterId,
                  },
               },
               update: {
                  currentPosition: progressData.currentPosition,
                  completed: progressData.completed || false,
                  lastListenedAt: new Date(),
               },
               create: {
                  userProfileId,
                  chapterId,
                  currentPosition: progressData.currentPosition,
                  completed: progressData.completed || false,
                  lastListenedAt: new Date(),
               },
            }),
         );

         return progress;
      } catch (error) {
         if (error instanceof ApiError) {
            throw error;
         }
         throw new ApiError('Failed to update chapter progress', 500);
      }
   }

   /**
    * Get chapter with user progress
    */
   async getChapterWithProgress(userProfileId: string, chapterId: string): Promise<ChapterWithProgress> {
      try {
         const chapter = await this.getChapterById(chapterId);
         const userProgress = await this.getChapterProgress(userProfileId, chapterId);

         const overallProgress = userProgress && chapter.duration
            ? (userProgress.currentPosition / chapter.duration) * 100
            : 0;

         return {
            ...chapter,
            userProgress: userProgress || undefined,
            overallProgress,
         } as ChapterWithProgress;
      } catch (error) {
         if (error instanceof ApiError) {
            throw error;
         }
         throw new ApiError('Failed to retrieve chapter with progress', 500);
      }
   }

   /**
    * Get chapter navigation (previous/next chapters)
    */
   async getChapterNavigation(userProfileId: string, chapterId: string): Promise<ChapterNavigation> {
      try {
         const currentChapter = await this.getChapterWithProgress(userProfileId, chapterId);

         // Get all chapters for the audiobook ordered by chapter number
         const allChapters = await this.prisma.chapter.findMany({
            where: { audiobookId: currentChapter.audiobookId },
            orderBy: { chapterNumber: 'asc' },
         });

         const currentIndex = allChapters.findIndex(ch => ch.id === chapterId);

         const previousChapter = currentIndex > 0
            ? await this.getChapterWithProgress(userProfileId, allChapters[currentIndex - 1]!.id)
            : undefined;

         const nextChapter = currentIndex < allChapters.length - 1
            ? await this.getChapterWithProgress(userProfileId, allChapters[currentIndex + 1]!.id)
            : undefined;

         return {
            currentChapter,
            previousChapter,
            nextChapter,
            totalChapters: allChapters.length,
            currentChapterIndex: currentIndex,
         } as ChapterNavigation;
      } catch (error) {
         if (error instanceof ApiError) {
            throw error;
         }
         throw new ApiError('Failed to retrieve chapter navigation', 500);
      }
   }

   /**
    * Get all chapters with progress for an audiobook
    */
   async getChaptersWithProgress(userProfileId: string, audiobookId: string): Promise<ChapterWithProgress[]> {
      try {
         const { chapters } = await this.getChaptersByAudiobookId(audiobookId);

         const chaptersWithProgress = await Promise.all(
            chapters.map(async (chapter) => {
               const userProgress = await this.getChapterProgress(userProfileId, chapter.id);
               const overallProgress = userProgress && chapter.duration
                  ? (userProgress.currentPosition / chapter.duration) * 100
                  : 0;

               return {
                  ...chapter,
                  userProgress,
                  overallProgress,
               };
            })
         );

         return chaptersWithProgress.map(chapter => ({
            ...chapter,
            userProgress: chapter.userProgress || undefined
         } as ChapterWithProgress));
      } catch (error) {
         rethrowServiceError(error, { operation: 'getChaptersWithProgress' }, MessageHandler.getErrorMessage('internal.default'));
      }
   }

   /**
    * Total audiobook duration in seconds (sum of all chapter durations).
    */
   async getAudiobookTotalDurationSeconds(audiobookId: string): Promise<number> {
      const result = await this.prisma.chapter.aggregate({
         where: { audiobookId },
         _sum: { duration: true },
      });
      return result._sum.duration ?? 0;
   }

   /**
    * Calculate audiobook progress as the sum of chapter progress positions (seconds).
    */
   async calculateAudiobookProgress(userProfileId: string, audiobookId: string): Promise<number> {
      try {
         const chapters = await this.prisma.chapter.findMany({
            where: { audiobookId },
            select: { id: true },
         });

         if (chapters.length === 0) {
            return 0;
         }

         const progressRows = await this.prisma.chapterProgress.findMany({
            where: {
               userProfileId,
               chapterId: { in: chapters.map((c) => c.id) },
            },
            select: { currentPosition: true },
         });

         return progressRows.reduce((sum, row) => sum + row.currentPosition, 0);
      } catch (error) {
         rethrowServiceError(error, { operation: 'calculateAudiobookProgress' }, MessageHandler.getErrorMessage('internal.default'));
      }
   }

   /**
    * Activate a chapter after all transcoding bitrates complete (RabbitMQ event from streaming-service).
    */
   async handleTranscodingCompleted(message: ChapterTranscodingCompletedMessage): Promise<void> {
      const chapter = await this.prisma.chapter.findUnique({
         where: { id: message.chapterId },
         select: {
            id: true,
            audiobookId: true,
            isActive: true,
            transcodingReady: true,
            scheduledAt: true,
         },
      });

      if (!chapter) {
         return;
      }

      if (chapter.transcodingReady && chapter.isActive) {
         return;
      }

      const now = new Date();
      const shouldActivate = chapter.scheduledAt === null || chapter.scheduledAt <= now;

      await runWrite(this.prisma, async (tx) =>
         tx.chapter.update({
            where: { id: chapter.id },
            data: {
               transcodingReady: true,
               ...(shouldActivate
                  ? { isActive: true, scheduledAt: null }
                  : {}),
            },
         }),
      );

      emitCacheInvalidation('chapter', 'updated', chapter.id, { audiobookId: chapter.audiobookId });
   }

   private async publishChapterTranscodingJob(
      chapter: {
         id: string;
         audiobookId: string;
         title: string;
         description: string | null;
         chapterNumber: number;
         duration: number | null;
         filePath: string | null;
         fileSize: bigint | null;
         startPosition: number | null;
         endPosition: number | null;
         createdAt: Date;
         updatedAt: Date;
      },
      options?: { forceRetranscode?: boolean }
   ): Promise<void> {
      if (
         !chapter.filePath ||
         chapter.duration == null ||
         chapter.startPosition == null ||
         chapter.endPosition == null ||
         chapter.fileSize == null
      ) {
         return;
      }

      try {
         const jobData: TranscodingJobData = {
            chapter: {
               id: chapter.id,
               audiobookId: chapter.audiobookId,
               title: chapter.title,
               ...(chapter.description && { description: chapter.description }),
               chapterNumber: chapter.chapterNumber,
               duration: chapter.duration,
               filePath: chapter.filePath,
               fileSize: Number(chapter.fileSize),
               startPosition: chapter.startPosition,
               endPosition: chapter.endPosition,
               createdAt: chapter.createdAt,
               updatedAt: chapter.updatedAt,
            },
            bitrates: config.TRANSCODING_BITRATES,
            priority: 'normal',
            ...(options?.forceRetranscode && { forceRetranscode: true }),
         };

         const rabbitMQ = RabbitMQFactory.getConnection();
         await rabbitMQ.publishTranscodingJob(jobData, 'normal');
      } catch (_error) {
         console.error(`Error publishing transcoding job for chapter ${chapter.id}:`, _error);
      }
   }

   private mapChapterRecord(chapter: {
      id: string;
      audiobookId: string;
      title: string;
      description: string | null;
      chapterNumber: number;
      duration: number | null;
      filePath: string | null;
      fileSize: bigint | null;
      coverImage: string | null;
      startPosition: number | null;
      endPosition: number | null;
      minSubscriptionTier?: SubscriptionTierLevel | null;
      isActive: boolean;
      transcodingReady?: boolean;
      sourceUploadStatus?: 'pending' | 'ready' | 'failed';
      sourceUploadError?: string | null;
      scheduledAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
      audiobook?: { id: string; title: string; author: string };
      chapterProgress?: unknown[];
      bookmarks?: unknown[];
      notes?: unknown[];
      pages?: Array<{
         id: string;
         chapterId: string;
         pageNumber: number;
         plainText: string;
         richText: unknown;
         createdAt: Date;
         updatedAt: Date;
      }>;
   }): ChapterWithRelations {
      return {
         id: chapter.id,
         audiobookId: chapter.audiobookId,
         title: chapter.title,
         description: chapter.description || undefined,
         chapterNumber: chapter.chapterNumber,
         duration: chapter.duration ?? null,
         filePath: chapter.filePath ?? null,
         fileSize: chapter.fileSize !== null && chapter.fileSize !== undefined ? Number(chapter.fileSize) : null,
         ...(chapter.coverImage ? { coverImage: chapter.coverImage } : {}),
         startPosition: chapter.startPosition ?? null,
         endPosition: chapter.endPosition ?? null,
         minSubscriptionTier: chapter.minSubscriptionTier ?? null,
         isActive: chapter.isActive,
         transcodingReady: chapter.transcodingReady ?? false,
         sourceUploadStatus: chapter.sourceUploadStatus ?? 'ready',
         ...(chapter.sourceUploadError ? { sourceUploadError: chapter.sourceUploadError } : {}),
         scheduledAt: chapter.scheduledAt ?? null,
         createdAt: chapter.createdAt,
         updatedAt: chapter.updatedAt,
         ...(chapter.pages && chapter.pages.length > 0 && {
            pages: chapter.pages.map((page) => toPageDto(page as PrismaPage)),
         }),
         ...(chapter.audiobook && { audiobook: chapter.audiobook }),
         ...(chapter.bookmarks && { bookmarks: chapter.bookmarks as ChapterWithRelations['bookmarks'] }),
         ...(chapter.notes && { notes: chapter.notes as ChapterWithRelations['notes'] }),
         ...(chapter.chapterProgress && {
            chapterProgress: chapter.chapterProgress as ChapterWithRelations['chapterProgress'],
         }),
      } as ChapterWithRelations;
   }

   private mapChapterData(chapter: {
      id: string;
      audiobookId: string;
      title: string;
      description: string | null;
      chapterNumber: number;
      duration: number | null;
      filePath: string | null;
      fileSize: bigint | null;
      coverImage: string | null;
      startPosition: number | null;
      endPosition: number | null;
      isActive: boolean;
      sourceUploadStatus?: 'pending' | 'ready' | 'failed';
      sourceUploadError?: string | null;
      scheduledAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
   }): ChapterWithRelations {
      return this.mapChapterRecord(chapter);
   }
}
