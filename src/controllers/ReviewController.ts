/**
 * Review Controller
 */
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { ReviewService } from '../services/ReviewService';
import { ResponseHandler } from '../utils/ResponseHandler';
import { ErrorHandler } from '../middleware/ErrorHandler';
import { MessageHandler } from '../utils/MessageHandler';
import {
   CreateReviewRequest,
   ReviewQueryParams,
   UpdateReviewRequest,
} from '../models/ReviewDto';
import { resolveUserId } from '../utils/resolveUserId';

export class ReviewController {
   private reviewService: ReviewService;

   constructor(prisma: PrismaClient) {
      this.reviewService = new ReviewService(prisma);
   }

   /**
    * @swagger
    * /api/v1/reviews:
    *   post:
    *     summary: Create a review
    *     tags: [Reviews]
    *     requestBody:
    *       required: true
    *       content:
    *         application/json:
    *           schema:
    *             $ref: '#/components/schemas/CreateReviewRequest'
    *     responses:
    *       201:
    *         description: Review created successfully
    *       409:
    *         $ref: '#/components/responses/Conflict'
    */
   createReview = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const userId = resolveUserId(req);
      const data: CreateReviewRequest = req.body;
      const review = await this.reviewService.createReview(userId, data);
      ResponseHandler.success(res, review, MessageHandler.getSuccessMessage('reviews.created'), 201);
   });

   /**
    * @swagger
    * /api/v1/reviews:
    *   get:
    *     summary: List reviews
    *     tags: [Reviews]
    *     parameters:
    *       - $ref: '#/components/parameters/PageParam'
    *       - $ref: '#/components/parameters/LimitParam'
    *       - name: audiobookId
    *         in: query
    *         schema:
    *           type: string
    *       - name: userId
    *         in: query
    *         schema:
    *           type: string
    *     responses:
    *       200:
    *         description: Reviews retrieved successfully
    */
   getReviews = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const page = req.query['page'] ? parseInt(req.query['page'] as string, 10) : 1;
      const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 20;
      const query: ReviewQueryParams = {
         audiobookId: req.query['audiobookId'] as string,
         userId: req.query['userId'] as string,
         page,
         limit,
         sortBy: (req.query['sortBy'] as ReviewQueryParams['sortBy']) || 'createdAt',
         sortOrder: (req.query['sortOrder'] as ReviewQueryParams['sortOrder']) || 'desc',
      };
      const result = await this.reviewService.getReviews(query);
      const pagination = ResponseHandler.calculatePagination(page, limit, result.totalCount);
      ResponseHandler.paginated(
         res,
         result.reviews,
         pagination,
         MessageHandler.getSuccessMessage('reviews.retrieved')
      );
   });

   /**
    * @swagger
    * /api/v1/reviews/{id}:
    *   get:
    *     summary: Get a review by ID
    *     tags: [Reviews]
    *     parameters:
    *       - name: id
    *         in: path
    *         required: true
    *         schema:
    *           type: string
    *     responses:
    *       200:
    *         description: Review retrieved successfully
    *       404:
    *         $ref: '#/components/responses/NotFound'
    */
   getReviewById = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { id } = req.params as { id: string };
      const review = await this.reviewService.getReviewById(id);
      ResponseHandler.success(res, review, MessageHandler.getSuccessMessage('reviews.retrieved_by_id'));
   });

   /**
    * @swagger
    * /api/v1/reviews/{id}:
    *   put:
    *     summary: Update own review rating
    *     tags: [Reviews]
    *     parameters:
    *       - name: id
    *         in: path
    *         required: true
    *         schema:
    *           type: string
    *     requestBody:
    *       required: true
    *       content:
    *         application/json:
    *           schema:
    *             $ref: '#/components/schemas/UpdateReviewRequest'
    *     responses:
    *       200:
    *         description: Review updated successfully
    *       403:
    *         $ref: '#/components/responses/Forbidden'
    */
   updateReview = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const userId = resolveUserId(req);
      const { id } = req.params as { id: string };
      const data: UpdateReviewRequest = req.body;
      const review = await this.reviewService.updateReview(id, userId, data);
      ResponseHandler.success(res, review, MessageHandler.getSuccessMessage('reviews.updated'));
   });

   /**
    * @swagger
    * /api/v1/reviews/{id}:
    *   delete:
    *     summary: Delete own review
    *     tags: [Reviews]
    *     parameters:
    *       - name: id
    *         in: path
    *         required: true
    *         schema:
    *           type: string
    *     responses:
    *       200:
    *         description: Review deleted successfully
    *       403:
    *         $ref: '#/components/responses/Forbidden'
    */
   deleteReview = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const userId = resolveUserId(req);
      const { id } = req.params as { id: string };
      await this.reviewService.deleteReview(id, userId);
      ResponseHandler.success(res, null, MessageHandler.getSuccessMessage('reviews.deleted'));
   });
}
