import { Prisma, PrismaClient, ReviewerType } from '@prisma/client';
import {
  AuthorReviewDto,
  AuthorReviewQueryParams,
  CreateAuthorReviewRequest,
  UpdateAuthorReviewRequest,
  toAuthorReviewDto,
} from '../models/AuthorReviewDto';
import { authClient, AuthAuthorCatalogInfo } from '../clients/AuthClient';
import { ApiError } from '../types/ApiError';
import { MessageHandler } from '../utils/MessageHandler';
import { HttpStatusCode, ErrorType } from '../types/common';
import { ResolvedReviewer } from '../types/reviewer';
import { runWrite } from '../utils/prismaTransaction';
import { getBackgroundJobService } from '../lib/backgroundJobs';

export class AuthorReviewService {
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

  private async assertNotSelfReview(
    reviewer: ResolvedReviewer,
    author: AuthAuthorCatalogInfo,
    accessToken: string,
    externalUserId?: string,
  ): Promise<void> {
    if (reviewer.type === ReviewerType.AUTHOR && reviewer.id === author.id) {
      throw ApiError.validationError(MessageHandler.getErrorMessage('author_reviews.self_review_forbidden'));
    }

    if (externalUserId && author.userId === externalUserId) {
      throw ApiError.validationError(MessageHandler.getErrorMessage('author_reviews.self_review_forbidden'));
    }

    if (externalUserId) {
      const myAuthor = await authClient.getAuthorByUserId(externalUserId, accessToken);
      if (myAuthor?.id === author.id) {
        throw ApiError.validationError(MessageHandler.getErrorMessage('author_reviews.self_review_forbidden'));
      }
    }
  }

  private isReviewerOwner(
    review: { reviewerType: ReviewerType; reviewerId: string },
    reviewer: ResolvedReviewer,
  ): boolean {
    return review.reviewerType === reviewer.type && review.reviewerId === reviewer.id;
  }

  private async scheduleTierRecalculation(authorId: string): Promise<void> {
    await getBackgroundJobService(this.prisma).scheduleReputationTierRecalculation({
      entityType: 'author',
      entityId: authorId,
    });
  }

  async createReview(
    reviewer: ResolvedReviewer,
    data: CreateAuthorReviewRequest,
    accessToken: string,
    externalUserId?: string,
  ): Promise<AuthorReviewDto> {
    this.validateRating(data.rating);

    const author = await authClient.getAuthorCatalogById(data.authorId, accessToken);
    if (!author) {
      throw ApiError.notFound(MessageHandler.getErrorMessage('authors.not_found'));
    }

    await this.assertNotSelfReview(reviewer, author, accessToken, externalUserId);

    const existing = await this.prisma.authorReview.findUnique({
      where: {
        authorId_reviewerType_reviewerId: {
          authorId: data.authorId,
          reviewerType: reviewer.type,
          reviewerId: reviewer.id,
        },
      },
    });

    if (existing) {
      throw new ApiError(
        MessageHandler.getErrorMessage('author_reviews.already_exists'),
        HttpStatusCode.CONFLICT,
        ErrorType.CONFLICT,
      );
    }

    const review = await runWrite(this.prisma, async (tx) =>
      tx.authorReview.create({
        data: {
          authorId: data.authorId,
          reviewerType: reviewer.type,
          reviewerId: reviewer.id,
          rating: data.rating,
          description: data.description?.trim() || null,
        },
      }),
    );

    await this.scheduleTierRecalculation(data.authorId);
    return toAuthorReviewDto(review);
  }

  async getReviews(query: AuthorReviewQueryParams): Promise<{ reviews: AuthorReviewDto[]; totalCount: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const where: Prisma.AuthorReviewWhereInput = {};
    if (query.authorId) where.authorId = query.authorId;
    if (query.reviewerType) where.reviewerType = query.reviewerType;
    if (query.reviewerId) where.reviewerId = query.reviewerId;

    const [reviews, totalCount] = await Promise.all([
      this.prisma.authorReview.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.authorReview.count({ where }),
    ]);

    return {
      reviews: reviews.map(toAuthorReviewDto),
      totalCount,
    };
  }

  async getReviewById(id: string): Promise<AuthorReviewDto> {
    const review = await this.prisma.authorReview.findUnique({ where: { id } });
    if (!review) {
      throw ApiError.notFound(MessageHandler.getErrorMessage('author_reviews.not_found'));
    }
    return toAuthorReviewDto(review);
  }

  async updateReview(
    id: string,
    reviewer: ResolvedReviewer,
    data: UpdateAuthorReviewRequest,
  ): Promise<AuthorReviewDto> {
    const existing = await this.prisma.authorReview.findUnique({ where: { id } });
    if (!existing) {
      throw ApiError.notFound(MessageHandler.getErrorMessage('author_reviews.not_found'));
    }
    if (!this.isReviewerOwner(existing, reviewer)) {
      throw ApiError.forbidden(MessageHandler.getErrorMessage('author_reviews.access_denied'));
    }

    if (data.rating !== undefined) {
      this.validateRating(data.rating);
    }

    const updated = await runWrite(this.prisma, async (tx) =>
      tx.authorReview.update({
        where: { id },
        data: {
          ...(data.rating !== undefined ? { rating: data.rating } : {}),
          ...(data.description !== undefined
            ? { description: data.description === null ? null : data.description.trim() || null }
            : {}),
        },
      }),
    );

    await this.scheduleTierRecalculation(existing.authorId);
    return toAuthorReviewDto(updated);
  }

  async deleteReview(id: string, reviewer: ResolvedReviewer): Promise<void> {
    const existing = await this.prisma.authorReview.findUnique({ where: { id } });
    if (!existing) {
      throw ApiError.notFound(MessageHandler.getErrorMessage('author_reviews.not_found'));
    }
    if (!this.isReviewerOwner(existing, reviewer)) {
      throw ApiError.forbidden(MessageHandler.getErrorMessage('author_reviews.access_denied'));
    }

    await runWrite(this.prisma, async (tx) => tx.authorReview.delete({ where: { id } }));
    await this.scheduleTierRecalculation(existing.authorId);
  }
}
