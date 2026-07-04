/**
 * AudioBook Routes
 * Handles audiobook CRUD operations, search, filtering, and statistics
 */
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { AudioBookController } from '../controllers/AudioBookController';
import { BackgroundJobService } from '../services/BackgroundJobService';
import { ValidationMiddleware } from '../middleware/ValidationMiddleware';
import { UploadMiddleware } from '../middleware/UploadMiddleware';
import { requireAuthenticated, requireContentCreator, requireContentManager } from '../middleware/RoleMiddleware';

export function createAudioBookRoutes(prisma: PrismaClient): Router {
   const router = Router();
   // Create BackgroundJobService instance to pass to AudioBookController
   const backgroundJobService = new BackgroundJobService(prisma);
   const audioBookController = new AudioBookController(prisma, backgroundJobService);

   /**
    * @swagger
    * /api/v1/audiobooks:
    *   get:
    *     summary: Get all audiobooks
    *     description: Retrieve a paginated list of audiobooks with optional filtering
    *     tags: [AudioBooks]
    *     security:
    *       - bearerAuth: []
    *     parameters:
    *       - $ref: '#/components/parameters/PageParam'
    *       - $ref: '#/components/parameters/LimitParam'
    *       - $ref: '#/components/parameters/SortByParam'
    *       - $ref: '#/components/parameters/SortOrderParam'
    *       - $ref: '#/components/parameters/SearchParam'
    *       - $ref: '#/components/parameters/GenreIdsParam'
    *       - $ref: '#/components/parameters/GenreIdParam'
    *       - $ref: '#/components/parameters/MoodIdParam'
    *       - $ref: '#/components/parameters/MoodIdsParam'
    *       - $ref: '#/components/parameters/ActiveParam'
    *       - $ref: '#/components/parameters/ScheduledParam'
    *       - $ref: '#/components/parameters/LanguageIdParam'
    *       - $ref: '#/components/parameters/AuthorParam'
    *       - $ref: '#/components/parameters/NarratorParam'
    *       - $ref: '#/components/parameters/IsActiveParam'
    *       - $ref: '#/components/parameters/IsPublicParam'
    *       - $ref: '#/components/parameters/OwnerTypeParam'
    *       - $ref: '#/components/parameters/OwnerIdParam'
    *       - $ref: '#/components/parameters/OwnerIdsParam'
    *     responses:
    *       200:
    *         $ref: '#/components/responses/PaginatedSuccess'
    *       401:
    *         $ref: '#/components/responses/UnauthorizedError'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   router.get(
      '/',
      requireAuthenticated(),
      ValidationMiddleware.validatePagination,
      ValidationMiddleware.validateAudioBookFilters,
      ValidationMiddleware.sanitizeQueryParams,
      audioBookController.getAllAudioBooks
   );

   /**
    * @swagger
    * /api/v1/audiobooks/search:
    *   get:
    *     summary: Search audiobooks
    *     description: Search audiobooks by title, author, or description
    *     tags: [AudioBooks]
    *     security:
    *       - bearerAuth: []
    *     parameters:
    *       - $ref: '#/components/parameters/QueryParam'
    *       - $ref: '#/components/parameters/PageParam'
    *       - $ref: '#/components/parameters/LimitParam'
    *     responses:
    *       200:
    *         $ref: '#/components/responses/PaginatedSuccess'
    *       400:
    *         $ref: '#/components/responses/ValidationError'
    *       401:
    *         $ref: '#/components/responses/UnauthorizedError'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   router.get(
      '/search',
      ValidationMiddleware.validatePagination,
      ValidationMiddleware.sanitizeQueryParams,
      audioBookController.searchAudioBooks
   );

   /**
    * @swagger
    * /api/v1/audiobooks/stats:
    *   get:
    *     summary: Get audiobook statistics
    *     description: Get statistics about audiobooks in the system
    *     tags: [AudioBooks]
    *     security:
    *       - bearerAuth: []
    *     responses:
    *       200:
    *         description: Statistics retrieved successfully
    *         content:
    *           application/json:
    *             schema:
    *               allOf:
    *                 - $ref: '#/components/schemas/ApiResponse'
    *                 - type: object
    *                   properties:
    *                     data:
    *                       type: object
    *                       properties:
    *                         totalAudioBooks:
    *                           type: 'integer'
    *                           example: 150
    *                         activeAudioBooks:
    *                           type: 'integer'
    *                           example: 120
    *                         publicAudioBooks:
    *                           type: 'integer'
    *                           example: 100
    *                         totalDuration:
    *                           type: 'integer'
    *                           example: 50000
    *                         averageDuration:
    *                           type: 'integer'
    *                           example: 333
    *       401:
    *         $ref: '#/components/responses/UnauthorizedError'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   router.get(
      '/stats',
      audioBookController.getAudioBookStats
   );

   /**
    * @swagger
    * /api/v1/audiobooks/genre/{genre}:
    *   get:
    *     summary: Get audiobooks by genre
    *     description: Retrieve audiobooks filtered by genre
    *     tags: [AudioBooks]
    *     security:
    *       - bearerAuth: []
    *     parameters:
    *       - $ref: '#/components/parameters/GenrePathParam'
    *       - $ref: '#/components/parameters/PageParam'
    *       - $ref: '#/components/parameters/LimitParam'
    *     responses:
    *       200:
    *         $ref: '#/components/responses/PaginatedSuccess'
    *       401:
    *         $ref: '#/components/responses/UnauthorizedError'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   router.get(
      '/genre/:genre',
      ValidationMiddleware.validatePagination,
      ValidationMiddleware.sanitizeQueryParams,
      audioBookController.getAudioBooksByGenre
   );

   /**
    * @swagger
    * /api/v1/audiobooks/author/{author}:
    *   get:
    *     summary: Get audiobooks by author
    *     description: Retrieve audiobooks filtered by author
    *     tags: [AudioBooks]
    *     security:
    *       - bearerAuth: []
    *     parameters:
    *       - $ref: '#/components/parameters/AuthorPathParam'
    *       - $ref: '#/components/parameters/PageParam'
    *       - $ref: '#/components/parameters/LimitParam'
    *     responses:
    *       200:
    *         $ref: '#/components/responses/PaginatedSuccess'
    *       401:
    *         $ref: '#/components/responses/UnauthorizedError'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   router.get(
      '/author/:author',
      ValidationMiddleware.validatePagination,
      ValidationMiddleware.sanitizeQueryParams,
      audioBookController.getAudioBooksByAuthor
   );

   /**
    * @swagger
    * /api/v1/audiobooks/tags/{tags}:
    *   get:
    *     summary: Get audiobooks by tags
    *     description: Retrieve audiobooks filtered by one or more tags (comma-separated)
    *     tags: [AudioBooks]
    *     security:
    *       - bearerAuth: []
    *     parameters:
    *       - name: tags
    *         in: path
    *         required: true
    *         description: Comma-separated list of tag names
    *         schema:
    *           type: string
    *           example: "fiction,adventure"
    *       - $ref: '#/components/parameters/PageParam'
    *       - $ref: '#/components/parameters/LimitParam'
    *       - $ref: '#/components/parameters/SortByParam'
    *       - $ref: '#/components/parameters/SortOrderParam'
    *       - $ref: '#/components/parameters/GenreParam'
    *       - $ref: '#/components/parameters/LanguageIdParam'
    *       - $ref: '#/components/parameters/AuthorParam'
    *       - $ref: '#/components/parameters/NarratorParam'
    *       - $ref: '#/components/parameters/IsActiveParam'
    *       - $ref: '#/components/parameters/IsPublicParam'
    *     responses:
    *       200:
    *         $ref: '#/components/responses/PaginatedSuccess'
    *       400:
    *         $ref: '#/components/responses/ValidationError'
    *       401:
    *         $ref: '#/components/responses/UnauthorizedError'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   router.get(
      '/tags/:tags',
      ValidationMiddleware.validateTags,
      ValidationMiddleware.validatePagination,
      ValidationMiddleware.validateAudioBookFilters,
      ValidationMiddleware.sanitizeQueryParams,
      audioBookController.getAudioBooksByTags
   );

   /**
    * @swagger
    * /api/v1/audiobooks/{id}:
    *   get:
    *     summary: Get audiobook by ID
    *     description: Retrieve a specific audiobook by its ID
    *     tags: [AudioBooks]
    *     security:
    *       - bearerAuth: []
    *     parameters:
    *       - $ref: '#/components/parameters/IdParam'
    *     responses:
    *       200:
    *         description: Audiobook retrieved successfully
    *         content:
    *           application/json:
    *             schema:
    *               allOf:
    *                 - $ref: '#/components/schemas/ApiResponse'
    *                 - type: object
    *                   properties:
    *                     data:
    *                       $ref: '#/components/schemas/AudioBook'
    *       400:
    *         $ref: '#/components/responses/ValidationError'
    *       401:
    *         $ref: '#/components/responses/UnauthorizedError'
    *       404:
    *         $ref: '#/components/responses/NotFoundError'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   router.get(
      '/:id',
      requireAuthenticated(),
      ValidationMiddleware.validateId,
      audioBookController.getAudioBookById
   );

   /**
    * @swagger
    * /api/v1/audiobooks:
    *   post:
    *     summary: Create audiobook
    *     description: Create a new audiobook with required polymorphic owner. Send multipart/form-data; cover image is required for publication audiobooks and optional for authoring audiobooks.
    *     tags: [AudioBooks]
    *     security:
    *       - bearerAuth: []
    *     requestBody:
    *       required: true
    *       content:
    *         multipart/form-data:
    *           schema:
    *             $ref: '#/components/schemas/CreateAudioBookFormData'
    *           examples:
    *             organizationOwner:
    *               summary: Create with organization owner
    *               value:
    *                 title: "My Audiobook"
    *                 author: "Jane Doe"
    *                 owner: '{"type":"ORGANIZATION","id":"corg1234567890abcdefghij"}'
    *                 genreIds: '["cgenre1234567890abcdefgh"]'
    *                 languageId: "cl000000000000000000000002"
    *                 isPublic: true
    *             authorOwner:
    *               summary: Create with author owner
    *               value:
    *                 title: "Author Audiobook"
    *                 author: "Jane Doe"
    *                 owner: '{"type":"AUTHOR","id":"cauthor1234567890abcdefgh"}'
    *                 genreIds: "cgenre1234567890abcdefgh,cgenre0987654321abcdefgh"
    *                 tagIds: '["ctag1234567890abcdefghij"]'
    *                 minSubscriptionTier: 2
    *                 scheduledAt: "2026-07-01T00:00:00Z"
    *     responses:
    *       201:
    *         description: Audiobook created successfully
    *         content:
    *           application/json:
    *             schema:
    *               allOf:
    *                 - $ref: '#/components/schemas/ApiResponse'
    *                 - type: object
    *                   properties:
    *                     data:
    *                       $ref: '#/components/schemas/AudioBook'
    *       400:
    *         $ref: '#/components/responses/ValidationError'
    *       401:
    *         $ref: '#/components/responses/UnauthorizedError'
    *       403:
    *         $ref: '#/components/responses/Forbidden'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   router.post(
      '/',
      requireContentCreator(),
      UploadMiddleware.handleAudiobookCreateUpload,
      ValidationMiddleware.validateAudioBookCreate,
      audioBookController.createAudioBook
   );

   /**
    * @swagger
    * /api/v1/audiobooks/{id}:
    *   put:
    *     summary: Update audiobook
    *     description: Update an existing audiobook
    *     tags: [AudioBooks]
    *     security:
    *       - bearerAuth: []
    *     parameters:
    *       - $ref: '#/components/parameters/IdParam'
    *     requestBody:
    *       required: true
    *       content:
    *         application/json:
    *           schema:
    *             $ref: '#/components/schemas/UpdateAudioBookRequest'
    *           examples:
    *             metadataUpdate:
    *               summary: Update metadata (JSON)
    *               value:
    *                 title: "Updated Title"
    *                 genreIds: ["cgenre1234567890abcdefgh"]
    *                 tagIds: ["ctag1234567890abcdefghij"]
    *                 minSubscriptionTier: 1
    *             ownerUpdate:
    *               summary: Change owner
    *               value:
    *                 owner: { type: "AUTHOR", id: "cauthor1234567890abcdefgh" }
    *         multipart/form-data:
    *           schema:
    *             type: object
    *             properties:
    *               title: { type: string, description: "Optional updated title" }
    *               author: { type: string, description: "Optional updated author name" }
    *               genreIds: { type: string, description: "Optional JSON array or comma-separated genre IDs" }
    *               tagIds: { type: string, description: "Optional JSON array or comma-separated tag IDs" }
    *               minSubscriptionTier: { type: integer, description: "Optional minimum subscription tier" }
    *               scheduledAt: { type: string, format: date-time, description: "Optional scheduled publish time" }
    *               coverImage: { type: string, format: binary, description: "Optional new cover image upload" }
    *           examples:
    *             coverImageUpdate:
    *               summary: Update cover image (multipart)
    *               value:
    *                 title: "Updated Title"
    *     responses:
    *       200:
    *         description: Audiobook updated successfully
    *         content:
    *           application/json:
    *             schema:
    *               allOf:
    *                 - $ref: '#/components/schemas/ApiResponse'
    *                 - type: object
    *                   properties:
    *                     data:
    *                       $ref: '#/components/schemas/AudioBook'
    *       400:
    *         $ref: '#/components/responses/ValidationError'
    *       401:
    *         $ref: '#/components/responses/UnauthorizedError'
    *       403:
    *         $ref: '#/components/responses/ForbiddenError'
    *       404:
    *         $ref: '#/components/responses/NotFoundError'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   router.put(
      '/:id',
      requireContentManager(),
      ValidationMiddleware.validateId,
      UploadMiddleware.handleImageUpload,
      audioBookController.updateAudioBook
   );

   /**
    * @swagger
    * /api/v1/audiobooks/{id}:
    *   delete:
    *     summary: Delete audiobook
    *     description: Delete an audiobook
    *     tags: [AudioBooks]
    *     security:
    *       - bearerAuth: []
    *     parameters:
    *       - $ref: '#/components/parameters/IdParam'
    *     responses:
    *       204:
    *         $ref: '#/components/responses/NoContent'
    *       400:
    *         $ref: '#/components/responses/ValidationError'
    *       401:
    *         $ref: '#/components/responses/UnauthorizedError'
    *       403:
    *         $ref: '#/components/responses/ForbiddenError'
    *       404:
    *         $ref: '#/components/responses/NotFoundError'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   router.delete(
      '/:id',
      requireContentManager(),
      ValidationMiddleware.validateId,
      audioBookController.deleteAudioBook
   );

   return router;
}
