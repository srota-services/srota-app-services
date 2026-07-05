/**
 * Favorite Service — user favorite audiobooks
 */
import { Prisma, PrismaClient } from '@prisma/client';
import {
   CreateFavoriteRequest,
   FavoriteDto,
   FavoriteQueryParams,
   toFavoriteDto,
} from '../models/FavoriteDto';
import { ApiError } from '../types/ApiError';
import { MessageHandler } from '../utils/MessageHandler';
import { HttpStatusCode, ErrorType } from '../types/common';
import { emitCacheInvalidation } from './DomainEventPublisher';
import { runWrite } from '../utils/prismaTransaction';

export class FavoriteService {
   constructor(private prisma: PrismaClient) {}

   async createFavorite(userId: string, data: CreateFavoriteRequest): Promise<FavoriteDto> {
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

      const existing = await this.prisma.favorite.findUnique({
         where: {
            userId_audiobookId: {
               userId,
               audiobookId: data.audiobookId,
            },
         },
      });
      if (existing) {
         throw new ApiError(
            MessageHandler.getErrorMessage('favorites.already_exists'),
            HttpStatusCode.CONFLICT,
            ErrorType.CONFLICT
         );
      }

      const favorite = await runWrite(this.prisma, async (tx) =>
         tx.favorite.create({
            data: {
               userId,
               audiobookId: data.audiobookId,
            },
         }),
      );

      emitCacheInvalidation('favorite', 'created', favorite.id);
      return toFavoriteDto(favorite);
   }

   async getFavorites(
      userId: string,
      query: FavoriteQueryParams
   ): Promise<{ favorites: FavoriteDto[]; totalCount: number }> {
      const page = query.page ?? 1;
      const limit = query.limit ?? 20;
      const skip = (page - 1) * limit;
      const sortBy = query.sortBy ?? 'createdAt';
      const sortOrder = query.sortOrder ?? 'desc';

      const where: Prisma.FavoriteWhereInput = { userId };
      if (query.audiobookId) where.audiobookId = query.audiobookId;

      const [favorites, totalCount] = await Promise.all([
         this.prisma.favorite.findMany({
            where,
            skip,
            take: limit,
            orderBy: { [sortBy]: sortOrder },
         }),
         this.prisma.favorite.count({ where }),
      ]);

      return {
         favorites: favorites.map(toFavoriteDto),
         totalCount,
      };
   }

   async getFavoriteById(id: string, userId: string): Promise<FavoriteDto> {
      const favorite = await this.prisma.favorite.findUnique({ where: { id } });
      if (!favorite) {
         throw new ApiError(
            MessageHandler.getErrorMessage('favorites.not_found'),
            HttpStatusCode.NOT_FOUND,
            ErrorType.NOT_FOUND
         );
      }
      if (favorite.userId !== userId) {
         throw ApiError.forbidden(MessageHandler.getErrorMessage('favorites.access_denied'));
      }
      return toFavoriteDto(favorite);
   }

   async deleteFavorite(id: string, userId: string): Promise<void> {
      const favorite = await this.prisma.favorite.findUnique({ where: { id } });
      if (!favorite) {
         throw new ApiError(
            MessageHandler.getErrorMessage('favorites.not_found'),
            HttpStatusCode.NOT_FOUND,
            ErrorType.NOT_FOUND
         );
      }
      if (favorite.userId !== userId) {
         throw ApiError.forbidden(MessageHandler.getErrorMessage('favorites.access_denied'));
      }

      await runWrite(this.prisma, async (tx) => tx.favorite.delete({ where: { id } }));
      emitCacheInvalidation('favorite', 'deleted', id);
   }
}
