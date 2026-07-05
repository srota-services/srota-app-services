/**
 * Chapter Controller
 * Handles HTTP requests and responses for chapter management
 */
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { ChapterService } from '../services/ChapterService';
import { ChapterWithRelations } from '../models/ChapterDto';
import { BackgroundJobService } from '../services/BackgroundJobService';
import { ContentAuthorizationService } from '../services/ContentAuthorizationService';
import { ResponseHandler } from '../utils/ResponseHandler';
import { ChapterQueryParams, CreateChapterRequest, UpdateChapterRequest } from '../models/ChapterDto';
import { parseOptionalMinSubscriptionTierFromForm } from '../utils/subscriptionGatingValidation';
import { ErrorHandler } from '../middleware/ErrorHandler';
import { MessageHandler } from '../utils/MessageHandler';
import { AuthenticatedRequest } from '../types/auth';
import { parsePagesFromBody } from '../utils/audiobookTypeValidation';
import { AudiobookType } from '@prisma/client';
import { isGuestRequest } from '../utils/guestCatalogDefaults';
import { resolveUserId } from '../utils/resolveUserId';

export class ChapterController {
   private chapterService: ChapterService;
   private contentAuthorizationService: ContentAuthorizationService;
   private prisma: PrismaClient;

   constructor(prisma: PrismaClient, backgroundJobService?: BackgroundJobService) {
      this.prisma = prisma;
      this.chapterService = new ChapterService(prisma, backgroundJobService);
      this.contentAuthorizationService = new ContentAuthorizationService(prisma);
   }

   private getBearerToken(req: Request): string | undefined {
      const authorization = req.headers.authorization;
      if (!authorization || !authorization.startsWith('Bearer ')) {
         return undefined;
      }
      const token = authorization.slice(7).trim();
      return token.length > 0 ? token : undefined;
   }

   private async attachChapterSubscriptionAccess(
      chapters: ChapterWithRelations[],
      audiobookId: string,
      req: Request,
   ): Promise<ChapterWithRelations[]> {
      const authUser = (req as AuthenticatedRequest).user;
      const userId = authUser?.id ?? null;
      const accessToken = this.getBearerToken(req) ?? null;

      const audiobook = await this.prisma.audioBook.findUnique({
         where: { id: audiobookId },
         select: { subscriptionGatingMode: true, minSubscriptionTier: true },
      });
      if (!audiobook) {
         return chapters;
      }

      return Promise.all(
         chapters.map(async (chapter) => ({
            ...chapter,
            subscriptionAccess: await this.chapterService.getSubscriptionAccessForChapter(
               { minSubscriptionTier: chapter.minSubscriptionTier ?? null },
               audiobook,
               userId,
               accessToken,
               authUser?.role ?? null,
            ),
         })),
      );
   }

   /**
    * @swagger
    * /api/v1/audiobooks/{audiobookId}/chapters:
    *   get:
    *     summary: Get all chapters for an audiobook
    *     description: Retrieve all chapters for a specific audiobook with optional pagination and sorting
    *     tags: [Chapters]
    *     parameters:
    *       - name: audiobookId
    *         in: path
    *         required: true
    *         schema:
    *           type: string
    *         description: Audiobook ID
    *       - $ref: '#/components/parameters/PageParam'
    *       - $ref: '#/components/parameters/LimitParam'
    *       - name: sortBy
    *         in: query
    *         schema:
    *           type: string
    *           enum: [chapterNumber, title, duration, createdAt]
    *           default: chapterNumber
    *         description: Field to sort by
    *       - name: sortOrder
    *         in: query
    *         schema:
    *           type: string
    *           enum: [asc, desc]
    *           default: asc
    *         description: Sort order
    *     responses:
    *       200:
    *         $ref: '#/components/responses/PaginatedSuccess'
    *       404:
    *         $ref: '#/components/responses/NotFound'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   getChaptersByAudiobookId = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { audiobookId } = req.params;
      const queryParams: ChapterQueryParams = {
         audiobookId: audiobookId!,
         page: req.query['page'] ? parseInt(req.query['page'] as string, 10) : 1,
         limit: req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 50,
         sortBy: req.query['sortBy'] as string || 'chapterNumber',
         sortOrder: (req.query['sortOrder'] as 'asc' | 'desc') || 'asc',
         activeOnly: isGuestRequest(req),
      };

      const { chapters, totalCount } = await this.chapterService.getChaptersByAudiobookId(audiobookId!, queryParams);
      const chaptersWithAccess = await this.attachChapterSubscriptionAccess(chapters, audiobookId!, req);

      const pagination = ResponseHandler.calculatePagination(
         queryParams.page!,
         queryParams.limit!,
         totalCount
      );

      ResponseHandler.paginated(res, chaptersWithAccess, pagination, MessageHandler.getSuccessMessage('chapters.retrieved'));
   });

   /**
    * @swagger
    * /api/v1/chapters/{id}:
    *   get:
    *     summary: Get chapter by ID
    *     description: Retrieve a specific chapter by its unique identifier
    *     tags: [Chapters]
    *     parameters:
    *       - name: id
    *         in: path
    *         required: true
    *         schema:
    *           type: string
    *         description: Chapter ID
    *     responses:
    *       200:
    *         description: Chapter retrieved successfully
    *         content:
    *           application/json:
    *             schema:
    *               allOf:
    *                 - $ref: '#/components/schemas/ApiResponse'
    *                 - type: object
    *                   properties:
    *                     data:
    *                       $ref: '#/components/schemas/Chapter'
    *       404:
    *         $ref: '#/components/responses/NotFound'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   getChapterById = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { id } = req.params;

      const chapter = await this.chapterService.getChapterById(id as string);

      if (isGuestRequest(req)) {
         if (!chapter.isActive) {
            ResponseHandler.notFound(res, MessageHandler.getErrorMessage('not_found.chapter'));
            return;
         }

         const audiobook = await this.prisma.audioBook.findUnique({
            where: { id: chapter.audiobookId },
            select: { isActive: true },
         });

         if (!audiobook?.isActive) {
            ResponseHandler.notFound(res, MessageHandler.getErrorMessage('not_found.chapter'));
            return;
         }
      }

      const [chapterWithAccess] = await this.attachChapterSubscriptionAccess(
         [chapter],
         chapter.audiobookId,
         req,
      );

      ResponseHandler.success(res, chapterWithAccess, MessageHandler.getSuccessMessage('chapters.retrieved_by_id'));
   });

   /**
    * @swagger
    * /api/v1/chapters/{id}/stream-gating:
    *   get:
    *     summary: Get chapter stream subscription gating context
    *     description: |
    *       Returns the minimum subscription tier required to stream this chapter.
    *       Used by streaming-service for LISTENER subscription gating. `requiredTier: null` means free access.
    *     tags: [Chapters]
    *     security:
    *       - bearerAuth: []
    *     parameters:
    *       - name: id
    *         in: path
    *         required: true
    *         schema:
    *           type: string
    *         description: Chapter ID
    *     responses:
    *       200:
    *         description: Stream gating context retrieved successfully
    *         content:
    *           application/json:
    *             schema:
    *               allOf:
    *                 - $ref: '#/components/schemas/ApiResponse'
    *                 - type: object
    *                   properties:
    *                     data:
    *                       type: object
    *                       required:
    *                         - chapterId
    *                         - requiredTier
    *                       properties:
    *                         chapterId:
    *                           type: string
    *                         requiredTier:
    *                           $ref: '#/components/schemas/SubscriptionTierLevel'
    *                           nullable: true
    *                           description: Minimum tier required to stream; null when chapter is free
    *       401:
    *         $ref: '#/components/responses/Unauthorized'
    *       404:
    *         $ref: '#/components/responses/NotFound'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   getChapterStreamGating = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { id } = req.params;

      const requiredTier = await this.chapterService.getChapterRequiredTierForStream(id as string);

      ResponseHandler.success(
         res,
         { chapterId: id, requiredTier },
         MessageHandler.getSuccessMessage('chapters.stream_gating_retrieved'),
      );
   });

   /**
    * @swagger
    * /api/v1/chapters:
    *   post:
    *     summary: Create a new chapter
    *     description: Create a new chapter. Publication chapters require cover image and audio; authoring chapters require at least one page (plain text optional) and may omit cover image.
    *     tags: [Chapters]
    *     requestBody:
    *       required: true
    *       content:
    *         multipart/form-data:
    *           schema:
    *             type: object
    *             required:
    *               - audiobookId
    *               - title
    *               - chapterNumber
    *               - duration
    *               - startPosition
    *               - endPosition
    *               - coverImage
    *               - file
    *             properties:
    *               audiobookId:
    *                 type: string
    *                 description: Audiobook ID
    *               title:
    *                 type: string
    *                 description: Chapter title
    *               description:
    *                 type: string
    *                 description: Chapter description
    *               chapterNumber:
    *                 type: integer
    *                 description: Chapter number
    *               duration:
    *                 type: integer
    *                 description: Duration in seconds
    *               startPosition:
    *                 type: integer
    *                 description: Start position in seconds
    *               endPosition:
    *                 type: integer
    *                 description: End position in seconds
    *               coverImage:
    *                 type: string
    *                 format: binary
    *                 description: Chapter cover image (required, max 50MB). Must be 1200×1200px minimum with 1:1 aspect ratio. Thumbnails are auto-generated.
    *               file:
    *                 type: string
    *                 format: binary
    *                 description: Audio file (required, max 1GB)
    *               minSubscriptionTier:
    *                 type: integer
    *                 nullable: true
    *                 description: When the audiobook uses CHAPTER gating, chapter 1 must be null (free). Later chapters require a tier.
    *           examples:
    *             example1:
    *               summary: Example chapter with audio file
    *               value:
    *                 audiobookId: "123e4567-e89b-12d3-a456-426614174000"
    *                 title: "Chapter 1: The Beginning"
    *                 description: "The story begins with our protagonist"
    *                 chapterNumber: 1
    *                 duration: 1800
    *                 startPosition: 0
    *                 endPosition: 1800
    *                 file: "[audio file]"
    *     responses:
    *       201:
    *         description: Chapter created successfully
    *         content:
    *           application/json:
    *             schema:
    *               allOf:
    *                 - $ref: '#/components/schemas/ApiResponse'
    *                 - type: object
    *                   properties:
    *                     data:
    *                       $ref: '#/components/schemas/Chapter'
    *       400:
    *         $ref: '#/components/responses/ValidationError'
    *       404:
    *         $ref: '#/components/responses/NotFound'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   createChapter = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const uploadedCoverImage = (req as any).coverImageFile as Express.Multer.File | undefined;
      const uploadedFile = (req as any).audioFile as Express.Multer.File | undefined;

      const audiobook = await this.prisma.audioBook.findUnique({
         where: { id: req.body.audiobookId },
         select: { type: true },
      });

      if (!audiobook) {
         ResponseHandler.notFound(res, MessageHandler.getErrorMessage('not_found.audiobook'));
         return;
      }

      const isAuthoring = audiobook.type === AudiobookType.AUTHORING;

      if (!isAuthoring && !uploadedCoverImage) {
         ResponseHandler.validationError(
            res,
            MessageHandler.getErrorMessage('validation.publication_chapter_cover_required'),
         );
         return;
      }

      if (!isAuthoring && !uploadedFile) {
         ResponseHandler.validationError(res, 'Audio file is required');
         return;
      }

      const chapterData: CreateChapterRequest = {
         audiobookId: req.body.audiobookId,
         title: req.body.title,
         description: req.body.description || undefined,
         chapterNumber: parseInt(req.body.chapterNumber, 10),
      };

      if (!isAuthoring) {
         const pagesField = req.body.pages;
         if (pagesField !== undefined && pagesField !== null && pagesField !== '') {
            ResponseHandler.validationError(
               res,
               MessageHandler.getErrorMessage('validation.pages_publication_forbidden'),
            );
            return;
         }

         chapterData.duration = parseInt(req.body.duration, 10);
         chapterData.startPosition = parseInt(req.body.startPosition, 10);
         chapterData.endPosition = parseInt(req.body.endPosition, 10);
      } else {
         const pages = parsePagesFromBody(req.body.pages);
         if (pages) {
            chapterData.pages = pages;
         }
      }

      if (req.body.scheduledAt) {
         chapterData.scheduledAt = new Date(req.body.scheduledAt);
      }

      if (!isAuthoring && req.body.minSubscriptionTier !== undefined) {
         chapterData.minSubscriptionTier = parseOptionalMinSubscriptionTierFromForm(
            req.body.minSubscriptionTier,
         ) ?? null;
      }

      const authReq = req as AuthenticatedRequest;
      const externalUserId = authReq.user?.id;
      const accessToken = this.getBearerToken(req);

      const { audiobookExists, allowed } = await this.contentAuthorizationService.canCreateChapter(
         externalUserId,
         chapterData.audiobookId,
         authReq.user?.role,
         accessToken,
      );

      if (!audiobookExists) {
         ResponseHandler.notFound(res, MessageHandler.getErrorMessage('not_found.audiobook'));
         return;
      }

      if (!allowed) {
         ResponseHandler.forbidden(
            res,
            MessageHandler.getErrorMessage('organizations.admin_required'),
         );
         return;
      }

      const chapter = await this.chapterService.createChapter(
         chapterData,
         isAuthoring ? undefined : uploadedFile,
         uploadedCoverImage,
      );

      ResponseHandler.success(res, chapter, MessageHandler.getSuccessMessage('chapters.created'), 201);
   });

   /**
    * @swagger
    * /api/v1/chapters/{id}:
    *   put:
    *     summary: Update an existing chapter
    *     description: Update an existing chapter with the provided information and optional audio file upload
    *     tags: [Chapters]
    *     parameters:
    *       - name: id
    *         in: path
    *         required: true
    *         schema:
    *           type: string
    *         description: Chapter ID
    *     requestBody:
    *       required: true
    *       content:
    *         multipart/form-data:
    *           schema:
    *             type: object
    *             properties:
    *               title:
    *                 type: string
    *                 description: Chapter title
    *               description:
    *                 type: string
    *                 description: Chapter description
    *               chapterNumber:
    *                 type: integer
    *                 description: Chapter number
    *               duration:
    *                 type: integer
    *                 description: Duration in seconds
    *               startPosition:
    *                 type: integer
    *                 description: Start position in seconds
    *               endPosition:
    *                 type: integer
    *                 description: End position in seconds
    *               file:
    *                 type: string
    *                 format: binary
    *                 description: Audio file (optional)
    *               coverImage:
    *                 type: string
    *                 format: binary
    *                 description: Chapter cover image (optional)
    *               isActive:
    *                 type: boolean
    *                 description: Whether the chapter is active
    *               scheduledAt:
    *                 type: string
    *                 format: date-time
    *                 description: Scheduled activation date
    *               minSubscriptionTier:
    *                 type: integer
    *                 description: Minimum subscription tier when audiobook uses CHAPTER gating mode
    *           examples:
    *             example1:
    *               summary: Update chapter with audio file
    *               value:
    *                 title: "Chapter 1: The Beginning (Updated)"
    *                 description: "An updated description of the first chapter"
    *                 duration: 1900
    *                 file: "[audio file]"
    *             example2:
    *               summary: Update chapter without file
    *               value:
    *                 title: "Chapter 1: The Beginning (Updated)"
    *                 description: "An updated description of the first chapter"
    *                 duration: 1900
    *     responses:
    *       200:
    *         description: Chapter updated successfully
    *         content:
    *           application/json:
    *             schema:
    *               allOf:
    *                 - $ref: '#/components/schemas/ApiResponse'
    *                 - type: object
    *                   properties:
    *                     data:
    *                       $ref: '#/components/schemas/Chapter'
    *       400:
    *         $ref: '#/components/responses/ValidationError'
    *       404:
    *         $ref: '#/components/responses/NotFound'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   updateChapter = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { id } = req.params;

      const authReq = req as AuthenticatedRequest;
      const externalUserId = authReq.user?.id;
      const accessToken = this.getBearerToken(req);

      const { chapterExists, allowed } = await this.contentAuthorizationService.canManageChapter(
         externalUserId,
         id as string,
         authReq.user?.role,
         accessToken,
      );

      if (!chapterExists) {
         ResponseHandler.notFound(res, MessageHandler.getErrorMessage('not_found.chapter'));
         return;
      }

      if (!allowed) {
         ResponseHandler.forbidden(
            res,
            MessageHandler.getErrorMessage('organizations.admin_required'),
         );
         return;
      }

      const pagesField = req.body.pages;
      if (pagesField !== undefined && pagesField !== null && pagesField !== '') {
         const existingChapter = await this.prisma.chapter.findUnique({
            where: { id: id as string },
            select: { audiobook: { select: { type: true } } },
         });

         if (existingChapter?.audiobook.type === AudiobookType.PUBLICATION) {
            ResponseHandler.validationError(
               res,
               MessageHandler.getErrorMessage('validation.pages_publication_forbidden'),
            );
            return;
         }
      }

      const uploadedFile = (req as any).audioFile as Express.Multer.File | undefined;
      const uploadedCoverImage = (req as any).coverImageFile as Express.Multer.File | undefined;

      // Parse form-data values (they come as strings from multipart/form-data)
      const updateData: UpdateChapterRequest = {};

      // Only include fields that are provided
      if (req.body.title !== undefined) {
         updateData.title = req.body.title;
      }
      if (req.body.description !== undefined) {
         updateData.description = req.body.description || undefined;
      }
      if (req.body.chapterNumber !== undefined) {
         updateData.chapterNumber = parseInt(req.body.chapterNumber, 10);
      }
      if (req.body.duration !== undefined) {
         updateData.duration = parseInt(req.body.duration, 10);
      }
      if (req.body.startPosition !== undefined) {
         updateData.startPosition = parseInt(req.body.startPosition, 10);
      }
      if (req.body.endPosition !== undefined) {
         updateData.endPosition = parseInt(req.body.endPosition, 10);
      }
      if (req.body.isActive !== undefined) {
         updateData.isActive = req.body.isActive === 'true' || req.body.isActive === true;
      }
      if (req.body.scheduledAt !== undefined && req.body.scheduledAt !== '') {
         updateData.scheduledAt = new Date(req.body.scheduledAt);
      }
      if (req.body.minSubscriptionTier !== undefined) {
         updateData.minSubscriptionTier = parseOptionalMinSubscriptionTierFromForm(
            req.body.minSubscriptionTier,
         ) ?? null;
      }

      // File data will be handled by uploadedFile
      if (uploadedFile) {
         updateData.filePath = uploadedFile.path;
         updateData.fileSize = uploadedFile.size;
      } else if (req.body.filePath !== undefined) {
         updateData.filePath = req.body.filePath;
      }
      if (req.body.fileSize !== undefined && !uploadedFile) {
         updateData.fileSize = parseInt(req.body.fileSize || '0', 10);
      }

      // Cover image can be updated via upload or body
      if (req.body.coverImage !== undefined) {
         updateData.coverImage = req.body.coverImage;
      }

      const chapter = await this.chapterService.updateChapter(id as string, updateData, uploadedFile, uploadedCoverImage);

      ResponseHandler.success(res, chapter, MessageHandler.getSuccessMessage('chapters.updated'));
   });

   /**
    * @swagger
    * /api/v1/chapters/{id}:
    *   delete:
    *     summary: Delete a chapter
    *     description: Delete a chapter by its unique identifier
    *     tags: [Chapters]
    *     parameters:
    *       - name: id
    *         in: path
    *         required: true
    *         schema:
    *           type: string
    *         description: Chapter ID
    *     responses:
    *       204:
    *         $ref: '#/components/responses/NoContent'
    *       404:
    *         $ref: '#/components/responses/NotFound'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   deleteChapter = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { id } = req.params;

      const authReq = req as AuthenticatedRequest;
      const externalUserId = authReq.user?.id;
      const accessToken = this.getBearerToken(req);

      const { chapterExists, allowed } = await this.contentAuthorizationService.canManageChapter(
         externalUserId,
         id as string,
         authReq.user?.role,
         accessToken,
      );

      if (!chapterExists) {
         ResponseHandler.notFound(res, MessageHandler.getErrorMessage('not_found.chapter'));
         return;
      }

      if (!allowed) {
         ResponseHandler.forbidden(
            res,
            MessageHandler.getErrorMessage('organizations.admin_required'),
         );
         return;
      }

      await this.chapterService.deleteChapter(id as string);

      ResponseHandler.noContent(res);
   });

   /**
    * @swagger
    * /api/v1/chapters/{id}/progress:
    *   get:
    *     summary: Get chapter progress for user
    *     description: Retrieve the current progress for a specific chapter for the authenticated user
    *     tags: [Chapters]
    *     parameters:
    *       - name: id
    *         in: path
    *         required: true
    *         schema:
    *           type: string
    *         description: Chapter ID
    *     responses:
    *       200:
    *         description: Chapter progress retrieved successfully
    *         content:
    *           application/json:
    *             schema:
    *               allOf:
    *                 - $ref: '#/components/schemas/ApiResponse'
    *                 - type: object
    *                   properties:
    *                     data:
    *                       $ref: '#/components/schemas/ChapterProgress'
    *       404:
    *         $ref: '#/components/responses/NotFound'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   getChapterProgress = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { id } = req.params;
      const userId = resolveUserId(req);

      const progress = await this.chapterService.getChapterProgress(userId, id as string);

      ResponseHandler.success(res, progress, MessageHandler.getSuccessMessage('chapters.progress_retrieved'));
   });

   /**
    * @swagger
    * /api/v1/chapters/{id}/progress:
    *   put:
    *     summary: Update chapter progress for user
    *     description: Update the current progress for a specific chapter for the authenticated user
    *     tags: [Chapters]
    *     parameters:
    *       - name: id
    *         in: path
    *         required: true
    *         schema:
    *           type: string
    *         description: Chapter ID
    *     requestBody:
    *       required: true
    *       content:
    *         application/json:
    *           schema:
    *             $ref: '#/components/schemas/UpdateChapterProgressRequest'
    *           examples:
    *             example1:
    *               summary: Update progress
    *               value:
    *                 currentPosition: 300
    *                 completed: false
    *     responses:
    *       200:
    *         description: Chapter progress updated successfully
    *         content:
    *           application/json:
    *             schema:
    *               allOf:
    *                 - $ref: '#/components/schemas/ApiResponse'
    *                 - type: object
    *                   properties:
    *                     data:
    *                       $ref: '#/components/schemas/ChapterProgress'
    *       400:
    *         $ref: '#/components/responses/ValidationError'
    *       404:
    *         $ref: '#/components/responses/NotFound'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   updateChapterProgress = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { id } = req.params;
      const userId = resolveUserId(req);
      const progressData = req.body;

      const progress = await this.chapterService.updateChapterProgress(userId, id as string, progressData);

      ResponseHandler.success(res, progress, MessageHandler.getSuccessMessage('chapters.progress_updated'));
   });

   /**
    * @swagger
    * /api/v1/chapters/{id}/with-progress:
    *   get:
    *     summary: Get chapter with user progress
    *     description: Retrieve a chapter along with the current progress for the authenticated user
    *     tags: [Chapters]
    *     parameters:
    *       - name: id
    *         in: path
    *         required: true
    *         schema:
    *           type: string
    *         description: Chapter ID
    *     responses:
    *       200:
    *         description: Chapter with progress retrieved successfully
    *         content:
    *           application/json:
    *             schema:
    *               allOf:
    *                 - $ref: '#/components/schemas/ApiResponse'
    *                 - type: object
    *                   properties:
    *                     data:
    *                       $ref: '#/components/schemas/ChapterWithProgress'
    *       404:
    *         $ref: '#/components/responses/NotFound'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   getChapterWithProgress = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { id } = req.params;
      const userId = resolveUserId(req);

      const chapterWithProgress = await this.chapterService.getChapterWithProgress(userId, id as string);

      ResponseHandler.success(res, chapterWithProgress, MessageHandler.getSuccessMessage('chapters.with_progress_retrieved'));
   });

   /**
    * @swagger
    * /api/v1/chapters/{id}/navigation:
    *   get:
    *     summary: Get chapter navigation
    *     description: Retrieve chapter navigation information including previous and next chapters
    *     tags: [Chapters]
    *     parameters:
    *       - name: id
    *         in: path
    *         required: true
    *         schema:
    *           type: string
    *         description: Chapter ID
    *     responses:
    *       200:
    *         description: Chapter navigation retrieved successfully
    *         content:
    *           application/json:
    *             schema:
    *               allOf:
    *                 - $ref: '#/components/schemas/ApiResponse'
    *                 - type: object
    *                   properties:
    *                     data:
    *                       $ref: '#/components/schemas/ChapterNavigation'
    *       404:
    *         $ref: '#/components/responses/NotFound'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   getChapterNavigation = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { id } = req.params;
      const userId = resolveUserId(req);

      const navigation = await this.chapterService.getChapterNavigation(userId, id as string);

      ResponseHandler.success(res, navigation, MessageHandler.getSuccessMessage('chapters.navigation_retrieved'));
   });

   /**
    * @swagger
    * /api/v1/audiobooks/{audiobookId}/chapters/with-progress:
    *   get:
    *     summary: Get all chapters with progress for an audiobook
    *     description: Retrieve all chapters for an audiobook along with the current progress for the authenticated user
    *     tags: [Chapters]
    *     parameters:
    *       - name: audiobookId
    *         in: path
    *         required: true
    *         schema:
    *           type: string
    *         description: Audiobook ID
    *     responses:
    *       200:
    *         description: Chapters with progress retrieved successfully
    *         content:
    *           application/json:
    *             schema:
    *               allOf:
    *                 - $ref: '#/components/schemas/ApiResponse'
    *                 - type: object
    *                   properties:
    *                     data:
    *                       type: array
    *                       items:
    *                         $ref: '#/components/schemas/ChapterWithProgress'
    *       404:
    *         $ref: '#/components/responses/NotFound'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   getChaptersWithProgress = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { audiobookId } = req.params;
      const userId = resolveUserId(req);

      const chaptersWithProgress = await this.chapterService.getChaptersWithProgress(userId, audiobookId!);

      ResponseHandler.success(res, chaptersWithProgress, MessageHandler.getSuccessMessage('chapters.with_progress_retrieved'));
   });
}
