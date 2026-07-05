/**
 * UserAudioBook Routes
 * Handles user-audiobook relationship HTTP endpoints
 */
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { UserAudioBookController } from '../controllers/UserAudioBookController';
import { ValidationMiddleware } from '../middleware/ValidationMiddleware';

export function createUserAudioBookRoutes(prisma: PrismaClient): Router {
   const router = Router();
   const userAudioBookController = new UserAudioBookController(prisma);

   /**
    * @swagger
    * /api/v1/user-audiobooks:
    *   get:
    *     summary: Get all user-audiobook relationships
    *     description: Retrieve a paginated list of user-audiobook relationships with optional filtering
    *     tags: [UserAudioBooks]
    *     responses:
    *       200:
    *         $ref: '#/components/responses/PaginatedSuccess'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   router.get(
      '/',
      ValidationMiddleware.validatePagination,
      ValidationMiddleware.sanitizeQueryParams,
      userAudioBookController.getAllUserAudioBooks
   );

   /**
    * @swagger
    * /api/v1/user-audiobooks:
    *   post:
    *     summary: Create a new user-audiobook relationship
    *     tags: [UserAudioBooks]
    *     responses:
    *       201:
    *         description: User-audiobook relationship created successfully
    *       400:
    *         $ref: '#/components/responses/ValidationError'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   router.post(
      '/',
      ValidationMiddleware.validateUserAudioBookCreation,
      userAudioBookController.createUserAudioBook
   );

   /**
    * @swagger
    * /api/v1/user-audiobooks/user/{userId}:
    *   get:
    *     summary: Get all audiobooks for a user
    *     tags: [UserAudioBooks]
    *     responses:
    *       200:
    *         $ref: '#/components/responses/PaginatedSuccess'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   router.get(
      '/user/:userId',
      ValidationMiddleware.validatePagination,
      ValidationMiddleware.sanitizeQueryParams,
      userAudioBookController.getUserAudioBooksByUserId
   );

   /**
    * @swagger
    * /api/v1/user-audiobooks/audiobook/{audiobookId}:
    *   get:
    *     summary: Get all users for an audiobook
    *     tags: [UserAudioBooks]
    *     responses:
    *       200:
    *         $ref: '#/components/responses/PaginatedSuccess'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   router.get(
      '/audiobook/:audiobookId',
      ValidationMiddleware.validatePagination,
      ValidationMiddleware.sanitizeQueryParams,
      userAudioBookController.getUserAudioBooksByAudiobookId
   );

   /**
    * @swagger
    * /api/v1/user-audiobooks/type/{type}:
    *   get:
    *     summary: Get all user-audiobook relationships by type
    *     tags: [UserAudioBooks]
    *     responses:
    *       200:
    *         $ref: '#/components/responses/PaginatedSuccess'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   router.get(
      '/type/:type',
      ValidationMiddleware.validateUserAudioBookType,
      ValidationMiddleware.validatePagination,
      ValidationMiddleware.sanitizeQueryParams,
      userAudioBookController.getUserAudioBooksByType
   );

   /**
    * @swagger
    * /api/v1/user-audiobooks/{id}:
    *   get:
    *     summary: Get user-audiobook relationship by ID
    *     tags: [UserAudioBooks]
    *     responses:
    *       200:
    *         description: User-audiobook relationship retrieved successfully
    *       404:
    *         $ref: '#/components/responses/NotFound'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   router.get(
      '/:id',
      ValidationMiddleware.validateId,
      userAudioBookController.getUserAudioBookById
   );

   /**
    * @swagger
    * /api/v1/user-audiobooks/{id}:
    *   delete:
    *     summary: Delete user-audiobook relationship
    *     tags: [UserAudioBooks]
    *     responses:
    *       200:
    *         description: User-audiobook relationship deleted successfully
    *       404:
    *         $ref: '#/components/responses/NotFound'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   router.delete(
      '/:id',
      ValidationMiddleware.validateId,
      userAudioBookController.deleteUserAudioBook
   );

   return router;
}

