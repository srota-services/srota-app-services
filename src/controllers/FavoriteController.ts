/**
 * Favorite Controller
 */
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { FavoriteService } from '../services/FavoriteService';
import { ResponseHandler } from '../utils/ResponseHandler';
import { ErrorHandler } from '../middleware/ErrorHandler';
import { MessageHandler } from '../utils/MessageHandler';
import { CreateFavoriteRequest, FavoriteQueryParams } from '../models/FavoriteDto';
import { resolveUserId } from '../utils/resolveUserId';

export class FavoriteController {
   private favoriteService: FavoriteService;

   constructor(prisma: PrismaClient) {
      this.favoriteService = new FavoriteService(prisma);
   }

   /**
    * @swagger
    * /api/v1/favorites:
    *   post:
    *     summary: Add an audiobook to favorites
    *     tags: [Favorites]
    *     requestBody:
    *       required: true
    *       content:
    *         application/json:
    *           schema:
    *             $ref: '#/components/schemas/CreateFavoriteRequest'
    *     responses:
    *       201:
    *         description: Favorite created successfully
    *       409:
    *         $ref: '#/components/responses/Conflict'
    */
   createFavorite = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const userId = resolveUserId(req);
      const data: CreateFavoriteRequest = req.body;
      const favorite = await this.favoriteService.createFavorite(userId, data);
      ResponseHandler.success(res, favorite, MessageHandler.getSuccessMessage('favorites.created'), 201);
   });

   /**
    * @swagger
    * /api/v1/favorites:
    *   get:
    *     summary: List current user favorites
    *     tags: [Favorites]
    *     parameters:
    *       - $ref: '#/components/parameters/PageParam'
    *       - $ref: '#/components/parameters/LimitParam'
    *       - name: audiobookId
    *         in: query
    *         schema:
    *           type: string
    *     responses:
    *       200:
    *         description: Favorites retrieved successfully
    */
   getFavorites = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const userId = resolveUserId(req);
      const page = req.query['page'] ? parseInt(req.query['page'] as string, 10) : 1;
      const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 20;
      const query: FavoriteQueryParams = {
         audiobookId: req.query['audiobookId'] as string,
         page,
         limit,
         sortBy: (req.query['sortBy'] as FavoriteQueryParams['sortBy']) || 'createdAt',
         sortOrder: (req.query['sortOrder'] as FavoriteQueryParams['sortOrder']) || 'desc',
      };
      const result = await this.favoriteService.getFavorites(userId, query);
      const pagination = ResponseHandler.calculatePagination(page, limit, result.totalCount);
      ResponseHandler.paginated(
         res,
         result.favorites,
         pagination,
         MessageHandler.getSuccessMessage('favorites.retrieved')
      );
   });

   /**
    * @swagger
    * /api/v1/favorites/{id}:
    *   get:
    *     summary: Get a favorite by ID
    *     tags: [Favorites]
    *     parameters:
    *       - name: id
    *         in: path
    *         required: true
    *         schema:
    *           type: string
    *     responses:
    *       200:
    *         description: Favorite retrieved successfully
    *       403:
    *         $ref: '#/components/responses/Forbidden'
    *       404:
    *         $ref: '#/components/responses/NotFound'
    */
   getFavoriteById = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const userId = resolveUserId(req);
      const { id } = req.params as { id: string };
      const favorite = await this.favoriteService.getFavoriteById(id, userId);
      ResponseHandler.success(res, favorite, MessageHandler.getSuccessMessage('favorites.retrieved_by_id'));
   });

   /**
    * @swagger
    * /api/v1/favorites/{id}:
    *   delete:
    *     summary: Remove a favorite
    *     tags: [Favorites]
    *     parameters:
    *       - name: id
    *         in: path
    *         required: true
    *         schema:
    *           type: string
    *     responses:
    *       200:
    *         description: Favorite deleted successfully
    *       403:
    *         $ref: '#/components/responses/Forbidden'
    */
   deleteFavorite = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const userId = resolveUserId(req);
      const { id } = req.params as { id: string };
      await this.favoriteService.deleteFavorite(id, userId);
      ResponseHandler.success(res, null, MessageHandler.getSuccessMessage('favorites.deleted'));
   });
}
