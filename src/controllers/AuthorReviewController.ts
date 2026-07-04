/**
 * Author Review Controller
 */
import { Request, Response } from 'express';
import { PrismaClient, ReviewerType } from '@prisma/client';
import { AuthorReviewService } from '../services/AuthorReviewService';
import { ResponseHandler } from '../utils/ResponseHandler';
import { ErrorHandler } from '../middleware/ErrorHandler';
import { MessageHandler } from '../utils/MessageHandler';
import {
  AuthorReviewQueryParams,
  CreateAuthorReviewRequest,
  UpdateAuthorReviewRequest,
} from '../models/AuthorReviewDto';
import { resolveReviewerFromJwt } from '../utils/resolveReviewerFromJwt';
import { AuthenticatedRequest } from '../types/auth';

function getBearerToken(req: Request): string | undefined {
  const authorization = req.headers.authorization;
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return undefined;
  }
  const token = authorization.slice(7).trim();
  return token.length > 0 ? token : undefined;
}

export class AuthorReviewController {
  private authorReviewService: AuthorReviewService;

  constructor(private prisma: PrismaClient) {
    this.authorReviewService = new AuthorReviewService(prisma);
  }

  /**
   * @swagger
   * /api/v1/author-reviews:
   *   post:
   *     summary: Create an author review
   *     tags: [AuthorReviews]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/CreateAuthorReviewRequest'
   *     responses:
   *       201:
   *         description: Author review created successfully
   *       409:
   *         $ref: '#/components/responses/Conflict'
   */
  createReview = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const reviewer = await resolveReviewerFromJwt(this.prisma, req);
    const accessToken = getBearerToken(req);
    if (!accessToken) {
      ResponseHandler.unauthorized(res, MessageHandler.getErrorMessage('unauthorized.not_authenticated'));
      return;
    }

    const data: CreateAuthorReviewRequest = req.body;
    const externalUserId = (req as AuthenticatedRequest).user?.id;
    const review = await this.authorReviewService.createReview(reviewer, data, accessToken, externalUserId);
    ResponseHandler.success(res, review, MessageHandler.getSuccessMessage('author_reviews.created'), 201);
  });

  /**
   * @swagger
   * /api/v1/author-reviews:
   *   get:
   *     summary: List author reviews
   *     tags: [AuthorReviews]
   *     parameters:
   *       - $ref: '#/components/parameters/PageParam'
   *       - $ref: '#/components/parameters/LimitParam'
   *       - name: authorId
   *         in: query
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Author reviews retrieved successfully
   */
  getReviews = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const page = req.query['page'] ? parseInt(req.query['page'] as string, 10) : 1;
    const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 20;
    const query: AuthorReviewQueryParams = {
      page,
      limit,
      sortBy: (req.query['sortBy'] as AuthorReviewQueryParams['sortBy']) || 'createdAt',
      sortOrder: (req.query['sortOrder'] as AuthorReviewQueryParams['sortOrder']) || 'desc',
      ...(req.query['authorId'] ? { authorId: req.query['authorId'] as string } : {}),
      ...(req.query['reviewerType']
        ? { reviewerType: req.query['reviewerType'] as ReviewerType }
        : {}),
      ...(req.query['reviewerId'] ? { reviewerId: req.query['reviewerId'] as string } : {}),
    };

    const result = await this.authorReviewService.getReviews(query);
    const pagination = ResponseHandler.calculatePagination(page, limit, result.totalCount);
    ResponseHandler.paginated(
      res,
      result.reviews,
      pagination,
      MessageHandler.getSuccessMessage('author_reviews.retrieved'),
    );
  });

  /**
   * @swagger
   * /api/v1/author-reviews/{id}:
   *   get:
   *     summary: Get author review by ID
   *     tags: [AuthorReviews]
   *     parameters:
   *       - $ref: '#/components/parameters/IdParam'
   *     responses:
   *       200:
   *         description: Author review retrieved successfully
   */
  getReviewById = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };
    const review = await this.authorReviewService.getReviewById(id);
    ResponseHandler.success(res, review, MessageHandler.getSuccessMessage('author_reviews.retrieved_by_id'));
  });

  /**
   * @swagger
   * /api/v1/author-reviews/{id}:
   *   put:
   *     summary: Update an author review
   *     tags: [AuthorReviews]
   *     parameters:
   *       - $ref: '#/components/parameters/IdParam'
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/UpdateAuthorReviewRequest'
   *     responses:
   *       200:
   *         description: Author review updated successfully
   */
  updateReview = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const reviewer = await resolveReviewerFromJwt(this.prisma, req);
    const { id } = req.params as { id: string };
    const data: UpdateAuthorReviewRequest = req.body;
    const review = await this.authorReviewService.updateReview(id, reviewer, data);
    ResponseHandler.success(res, review, MessageHandler.getSuccessMessage('author_reviews.updated'));
  });

  /**
   * @swagger
   * /api/v1/author-reviews/{id}:
   *   delete:
   *     summary: Delete an author review
   *     tags: [AuthorReviews]
   *     parameters:
   *       - $ref: '#/components/parameters/IdParam'
   *     responses:
   *       200:
   *         description: Author review deleted successfully
   */
  deleteReview = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const reviewer = await resolveReviewerFromJwt(this.prisma, req);
    const { id } = req.params as { id: string };
    await this.authorReviewService.deleteReview(id, reviewer);
    ResponseHandler.success(res, null, MessageHandler.getSuccessMessage('author_reviews.deleted'));
  });
}
