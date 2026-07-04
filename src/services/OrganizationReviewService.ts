import { Prisma, PrismaClient, ReviewerType } from '@prisma/client';
import {
  CreateOrganizationReviewRequest,
  OrganizationReviewDto,
  OrganizationReviewQueryParams,
  UpdateOrganizationReviewRequest,
  toOrganizationReviewDto,
} from '../models/OrganizationReviewDto';
import { authClient } from '../clients/AuthClient';
import { ApiError } from '../types/ApiError';
import { MessageHandler } from '../utils/MessageHandler';
import { HttpStatusCode, ErrorType } from '../types/common';
import { ResolvedReviewer } from '../types/reviewer';
import { runWrite } from '../utils/prismaTransaction';
import { getBackgroundJobService } from '../lib/backgroundJobs';

export class OrganizationReviewService {
  constructor(private prisma: PrismaClient) {}

  private validateRating(rating: number): void {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new ApiError(
        MessageHandler.getErrorMessage('validation.review_rating_invalid'),
        HttpStatusCode.BAD_REQUEST,
        ErrorType.VALIDATION_ERROR,
      );
    }
  }

  private async assertNotMemberReview(organizationId: string, accessToken: string): Promise<void> {
    const membership = await authClient.getMembership(organizationId, accessToken);
    if (membership) {
      throw ApiError.validationError(MessageHandler.getErrorMessage('organization_reviews.member_review_forbidden'));
    }
  }

  private isReviewerOwner(
    review: { reviewerType: ReviewerType; reviewerId: string },
    reviewer: ResolvedReviewer,
  ): boolean {
    return review.reviewerType === reviewer.type && review.reviewerId === reviewer.id;
  }

  private async scheduleTierRecalculation(organizationId: string): Promise<void> {
    await getBackgroundJobService(this.prisma).scheduleReputationTierRecalculation({
      entityType: 'organization',
      entityId: organizationId,
    });
  }

  async createReview(
    reviewer: ResolvedReviewer,
    data: CreateOrganizationReviewRequest,
    accessToken: string,
  ): Promise<OrganizationReviewDto> {
    this.validateRating(data.rating);
    await this.assertNotMemberReview(data.organizationId, accessToken);

    const organization = await authClient.getOrganizationCatalogById(data.organizationId, accessToken);
    if (!organization) {
      throw ApiError.notFound(MessageHandler.getErrorMessage('organizations.not_found'));
    }

    const existing = await this.prisma.organizationReview.findUnique({
      where: {
        organizationId_reviewerType_reviewerId: {
          organizationId: data.organizationId,
          reviewerType: reviewer.type,
          reviewerId: reviewer.id,
        },
      },
    });

    if (existing) {
      throw new ApiError(
        MessageHandler.getErrorMessage('organization_reviews.already_exists'),
        HttpStatusCode.CONFLICT,
        ErrorType.CONFLICT,
      );
    }

    const review = await runWrite(this.prisma, async (tx) =>
      tx.organizationReview.create({
        data: {
          organizationId: data.organizationId,
          reviewerType: reviewer.type,
          reviewerId: reviewer.id,
          rating: data.rating,
          description: data.description?.trim() || null,
        },
      }),
    );

    await this.scheduleTierRecalculation(data.organizationId);
    return toOrganizationReviewDto(review);
  }

  async getReviews(
    query: OrganizationReviewQueryParams,
  ): Promise<{ reviews: OrganizationReviewDto[]; totalCount: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const where: Prisma.OrganizationReviewWhereInput = {};
    if (query.organizationId) where.organizationId = query.organizationId;
    if (query.reviewerType) where.reviewerType = query.reviewerType;
    if (query.reviewerId) where.reviewerId = query.reviewerId;

    const [reviews, totalCount] = await Promise.all([
      this.prisma.organizationReview.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.organizationReview.count({ where }),
    ]);

    return {
      reviews: reviews.map(toOrganizationReviewDto),
      totalCount,
    };
  }

  async getReviewById(id: string): Promise<OrganizationReviewDto> {
    const review = await this.prisma.organizationReview.findUnique({ where: { id } });
    if (!review) {
      throw ApiError.notFound(MessageHandler.getErrorMessage('organization_reviews.not_found'));
    }
    return toOrganizationReviewDto(review);
  }

  async updateReview(
    id: string,
    reviewer: ResolvedReviewer,
    data: UpdateOrganizationReviewRequest,
  ): Promise<OrganizationReviewDto> {
    const existing = await this.prisma.organizationReview.findUnique({ where: { id } });
    if (!existing) {
      throw ApiError.notFound(MessageHandler.getErrorMessage('organization_reviews.not_found'));
    }
    if (!this.isReviewerOwner(existing, reviewer)) {
      throw ApiError.forbidden(MessageHandler.getErrorMessage('organization_reviews.access_denied'));
    }

    if (data.rating !== undefined) {
      this.validateRating(data.rating);
    }

    const updated = await runWrite(this.prisma, async (tx) =>
      tx.organizationReview.update({
        where: { id },
        data: {
          ...(data.rating !== undefined ? { rating: data.rating } : {}),
          ...(data.description !== undefined
            ? { description: data.description === null ? null : data.description.trim() || null }
            : {}),
        },
      }),
    );

    await this.scheduleTierRecalculation(existing.organizationId);
    return toOrganizationReviewDto(updated);
  }

  async deleteReview(id: string, reviewer: ResolvedReviewer): Promise<void> {
    const existing = await this.prisma.organizationReview.findUnique({ where: { id } });
    if (!existing) {
      throw ApiError.notFound(MessageHandler.getErrorMessage('organization_reviews.not_found'));
    }
    if (!this.isReviewerOwner(existing, reviewer)) {
      throw ApiError.forbidden(MessageHandler.getErrorMessage('organization_reviews.access_denied'));
    }

    await runWrite(this.prisma, async (tx) => tx.organizationReview.delete({ where: { id } }));
    await this.scheduleTierRecalculation(existing.organizationId);
  }
}
