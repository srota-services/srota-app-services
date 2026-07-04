/**
 * Organization Review Controller
 */
import { Request, Response } from 'express';
import { PrismaClient, ReviewerType } from '@prisma/client';
import { OrganizationReviewService } from '../services/OrganizationReviewService';
import { ResponseHandler } from '../utils/ResponseHandler';
import { ErrorHandler } from '../middleware/ErrorHandler';
import { MessageHandler } from '../utils/MessageHandler';
import {
  CreateOrganizationReviewRequest,
  OrganizationReviewQueryParams,
  UpdateOrganizationReviewRequest,
} from '../models/OrganizationReviewDto';
import { resolveReviewerFromJwt } from '../utils/resolveReviewerFromJwt';

function getBearerToken(req: Request): string | undefined {
  const authorization = req.headers.authorization;
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return undefined;
  }
  const token = authorization.slice(7).trim();
  return token.length > 0 ? token : undefined;
}

export class OrganizationReviewController {
  private organizationReviewService: OrganizationReviewService;

  constructor(private prisma: PrismaClient) {
    this.organizationReviewService = new OrganizationReviewService(prisma);
  }

  /**
   * @swagger
   * /api/v1/organization-reviews:
   *   post:
   *     summary: Create an organization review
   *     tags: [OrganizationReviews]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/CreateOrganizationReviewRequest'
   *     responses:
   *       201:
   *         description: Organization review created successfully
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

    const data: CreateOrganizationReviewRequest = req.body;
    const review = await this.organizationReviewService.createReview(reviewer, data, accessToken);
    ResponseHandler.success(
      res,
      review,
      MessageHandler.getSuccessMessage('organization_reviews.created'),
      201,
    );
  });

  /**
   * @swagger
   * /api/v1/organization-reviews:
   *   get:
   *     summary: List organization reviews
   *     tags: [OrganizationReviews]
   *     parameters:
   *       - $ref: '#/components/parameters/PageParam'
   *       - $ref: '#/components/parameters/LimitParam'
   *       - name: organizationId
   *         in: query
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Organization reviews retrieved successfully
   */
  getReviews = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const page = req.query['page'] ? parseInt(req.query['page'] as string, 10) : 1;
    const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 20;
    const query: OrganizationReviewQueryParams = {
      page,
      limit,
      sortBy: (req.query['sortBy'] as OrganizationReviewQueryParams['sortBy']) || 'createdAt',
      sortOrder: (req.query['sortOrder'] as OrganizationReviewQueryParams['sortOrder']) || 'desc',
      ...(req.query['organizationId']
        ? { organizationId: req.query['organizationId'] as string }
        : {}),
      ...(req.query['reviewerType']
        ? { reviewerType: req.query['reviewerType'] as ReviewerType }
        : {}),
      ...(req.query['reviewerId'] ? { reviewerId: req.query['reviewerId'] as string } : {}),
    };

    const result = await this.organizationReviewService.getReviews(query);
    const pagination = ResponseHandler.calculatePagination(page, limit, result.totalCount);
    ResponseHandler.paginated(
      res,
      result.reviews,
      pagination,
      MessageHandler.getSuccessMessage('organization_reviews.retrieved'),
    );
  });

  /**
   * @swagger
   * /api/v1/organization-reviews/{id}:
   *   get:
   *     summary: Get organization review by ID
   *     tags: [OrganizationReviews]
   *     parameters:
   *       - $ref: '#/components/parameters/IdParam'
   *     responses:
   *       200:
   *         description: Organization review retrieved successfully
   */
  getReviewById = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };
    const review = await this.organizationReviewService.getReviewById(id);
    ResponseHandler.success(res, review, MessageHandler.getSuccessMessage('organization_reviews.retrieved_by_id'));
  });

  /**
   * @swagger
   * /api/v1/organization-reviews/{id}:
   *   put:
   *     summary: Update an organization review
   *     tags: [OrganizationReviews]
   *     parameters:
   *       - $ref: '#/components/parameters/IdParam'
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/UpdateOrganizationReviewRequest'
   *     responses:
   *       200:
   *         description: Organization review updated successfully
   */
  updateReview = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const reviewer = await resolveReviewerFromJwt(this.prisma, req);
    const { id } = req.params as { id: string };
    const data: UpdateOrganizationReviewRequest = req.body;
    const review = await this.organizationReviewService.updateReview(id, reviewer, data);
    ResponseHandler.success(res, review, MessageHandler.getSuccessMessage('organization_reviews.updated'));
  });

  /**
   * @swagger
   * /api/v1/organization-reviews/{id}:
   *   delete:
   *     summary: Delete an organization review
   *     tags: [OrganizationReviews]
   *     parameters:
   *       - $ref: '#/components/parameters/IdParam'
   *     responses:
   *       200:
   *         description: Organization review deleted successfully
   */
  deleteReview = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const reviewer = await resolveReviewerFromJwt(this.prisma, req);
    const { id } = req.params as { id: string };
    await this.organizationReviewService.deleteReview(id, reviewer);
    ResponseHandler.success(res, null, MessageHandler.getSuccessMessage('organization_reviews.deleted'));
  });
}
