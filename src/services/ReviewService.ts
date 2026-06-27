/**
 * Review Service — rating-only audiobook reviews
 */
import { Prisma, PrismaClient } from '@prisma/client';
import {
   CreateReviewRequest,
   ReviewDto,
   ReviewQueryParams,
   UpdateReviewRequest,
   toReviewDto,
} from '../models/ReviewDto';
import { ApiError } from '../types/ApiError';
import { MessageHandler } from '../utils/MessageHandler';
import { HttpStatusCode, ErrorType } from '../types/common';
import { emitCacheInvalidation } from './DomainEventPublisher';
import { runWrite } from '../utils/prismaTransaction';

export class ReviewService {
   constructor(private prisma: PrismaClient) {}

   private validateRating(rating: number): void {
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
         throw new ApiError(
            MessageHandler.getErrorMessage('validation.review_rating_invalid'),
            HttpStatusCode.BAD_REQUEST,
            ErrorType.VALIDATION_ERROR
         );
      }
   }

   async createReview(userProfileId: string, data: CreateReviewRequest): Promise<ReviewDto> {
      this.validateRating(data.rating);

      const audiobook = await this.prisma.audioBook.findUnique({
         where: { id: data.audiobookId },
      });
      if (!audiobook) {
         throw new ApiError(
            MessageHandler.getErrorMessage('not_found.audiobook'),
            HttpStatusCode.NOT_FOUND,
            ErrorType.NOT_FOUND
         );
      }

      const existing = await this.prisma.review.findUnique({
         where: {
            userProfileId_audiobookId: {
               userProfileId,
               audiobookId: data.audiobookId,
            },
         },
      });
      if (existing) {
         throw new ApiError(
            MessageHandler.getErrorMessage('reviews.already_exists'),
            HttpStatusCode.CONFLICT,
            ErrorType.CONFLICT
         );
      }

      const review = await runWrite(this.prisma, async (tx) =>
         tx.review.create({
            data: {
               userProfileId,
               audiobookId: data.audiobookId,
               rating: data.rating,
            },
         }),
      );

      emitCacheInvalidation('review', 'created', review.id, { audiobookId: data.audiobookId });
      return toReviewDto(review);
   }

   async getReviews(query: ReviewQueryParams): Promise<{ reviews: ReviewDto[]; totalCount: number }> {
      const page = query.page ?? 1;
      const limit = query.limit ?? 20;
      const skip = (page - 1) * limit;
      const sortBy = query.sortBy ?? 'createdAt';
      const sortOrder = query.sortOrder ?? 'desc';

      const where: Prisma.ReviewWhereInput = {};
      if (query.audiobookId) where.audiobookId = query.audiobookId;
      if (query.userProfileId) where.userProfileId = query.userProfileId;

      const [reviews, totalCount] = await Promise.all([
         this.prisma.review.findMany({
            where,
            skip,
            take: limit,
            orderBy: { [sortBy]: sortOrder },
         }),
         this.prisma.review.count({ where }),
      ]);

      return {
         reviews: reviews.map(toReviewDto),
         totalCount,
      };
   }

   async getReviewById(id: string): Promise<ReviewDto> {
      const review = await this.prisma.review.findUnique({ where: { id } });
      if (!review) {
         throw new ApiError(
            MessageHandler.getErrorMessage('reviews.not_found'),
            HttpStatusCode.NOT_FOUND,
            ErrorType.NOT_FOUND
         );
      }
      return toReviewDto(review);
   }

   async updateReview(
      id: string,
      userProfileId: string,
      data: UpdateReviewRequest
   ): Promise<ReviewDto> {
      this.validateRating(data.rating);

      const existing = await this.prisma.review.findUnique({ where: { id } });
      if (!existing) {
         throw new ApiError(
            MessageHandler.getErrorMessage('reviews.not_found'),
            HttpStatusCode.NOT_FOUND,
            ErrorType.NOT_FOUND
         );
      }
      if (existing.userProfileId !== userProfileId) {
         throw ApiError.forbidden(MessageHandler.getErrorMessage('reviews.access_denied'));
      }

      const updated = await runWrite(this.prisma, async (tx) =>
         tx.review.update({
            where: { id },
            data: { rating: data.rating },
         }),
      );

      emitCacheInvalidation('review', 'updated', id, { audiobookId: existing.audiobookId });
      return toReviewDto(updated);
   }

   async deleteReview(id: string, userProfileId: string): Promise<void> {
      const existing = await this.prisma.review.findUnique({ where: { id } });
      if (!existing) {
         throw new ApiError(
            MessageHandler.getErrorMessage('reviews.not_found'),
            HttpStatusCode.NOT_FOUND,
            ErrorType.NOT_FOUND
         );
      }
      if (existing.userProfileId !== userProfileId) {
         throw ApiError.forbidden(MessageHandler.getErrorMessage('reviews.access_denied'));
      }

      await runWrite(this.prisma, async (tx) => tx.review.delete({ where: { id } }));
      emitCacheInvalidation('review', 'deleted', id, { audiobookId: existing.audiobookId });
   }
}
