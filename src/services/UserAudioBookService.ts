/**
 * UserAudioBook Service Layer
 * Handles business logic and database operations for user-audiobook relationships
 */
import { PrismaClient, UserAudioBookType, Prisma } from '@prisma/client';
import {
   UserAudioBookDto,
   UserAudioBookWithRelations,
   CreateUserAudioBookDto,
   UserAudioBookQueryParams,
   toUserAudioBookDto,
   toUserAudioBookWithRelations
} from '../models/UserAudioBookDto';
import { ApiError } from '../types/ApiError';
import { MessageHandler } from '../utils/MessageHandler';
import { HttpStatusCode, ErrorType } from '../types/common';
import { fileUrlService } from './FileUrlService';
import { emitCacheInvalidation } from './DomainEventPublisher';
import { runWrite } from '../utils/prismaTransaction';
import { rethrowServiceError } from '../utils/serviceError';

export class UserAudioBookService {
   private prisma: PrismaClient;

   constructor(prisma: PrismaClient) {
      this.prisma = prisma;
   }

   /**
    * Create a new user-audiobook relationship (always PURCHASED — type is server-assigned)
    */
   async createUserAudioBook(data: CreateUserAudioBookDto): Promise<UserAudioBookDto> {
      try {
         await this.validateUserAndAudiobook(data.userId, data.audiobookId);
         await this.assertNoDuplicateRelationship(data.userId, data.audiobookId);

         const created = await runWrite(this.prisma, async (tx) =>
            tx.userAudioBook.create({
               data: {
                  userId: data.userId,
                  audiobookId: data.audiobookId,
                  type: UserAudioBookType.PURCHASED
               }
            }),
         );

         emitCacheInvalidation('user-audiobook', 'created', created.id);
         return toUserAudioBookDto(created);
      } catch (error) {
         if (error instanceof ApiError) {
            throw error;
         }
         throw new ApiError(
            MessageHandler.getErrorMessage('internal.create_user_audiobook'),
            HttpStatusCode.INTERNAL_SERVER_ERROR,
            ErrorType.INTERNAL_ERROR
         );
      }
   }

   /**
    * Create OWNED relationship when the user creates an audiobook (creator is owner).
    * Skips silently if the relationship already exists.
    */
   async createOwnedUserAudioBook(userId: string, audiobookId: string): Promise<UserAudioBookDto | null> {
      try {
         await this.validateUserAndAudiobook(userId, audiobookId);

         const existing = await this.prisma.userAudioBook.findUnique({
            where: {
               userId_audiobookId: {
                  userId,
                  audiobookId
               }
            }
         });

         if (existing) {
            return toUserAudioBookDto(existing);
         }

         const created = await runWrite(this.prisma, async (tx) =>
            tx.userAudioBook.create({
               data: {
                  userId,
                  audiobookId,
                  type: UserAudioBookType.OWNED
               }
            }),
         );

         emitCacheInvalidation('user-audiobook', 'created', created.id);
         return toUserAudioBookDto(created);
      } catch (error) {
         if (error instanceof ApiError) {
            throw error;
         }
         throw new ApiError(
            MessageHandler.getErrorMessage('internal.create_user_audiobook'),
            HttpStatusCode.INTERNAL_SERVER_ERROR,
            ErrorType.INTERNAL_ERROR
         );
      }
   }

   private async validateUserAndAudiobook(_userId: string, audiobookId: string): Promise<void> {
      const audiobook = await this.prisma.audioBook.findUnique({
         where: { id: audiobookId }
      });
      if (!audiobook) {
         throw new ApiError(
            MessageHandler.getErrorMessage('not_found.audiobook'),
            HttpStatusCode.NOT_FOUND,
            ErrorType.NOT_FOUND
         );
      }
   }

   private async assertNoDuplicateRelationship(userId: string, audiobookId: string): Promise<void> {
      const existing = await this.prisma.userAudioBook.findUnique({
         where: {
            userId_audiobookId: {
               userId,
               audiobookId
            }
         }
      });

      if (existing) {
         throw new ApiError(
            MessageHandler.getErrorMessage('conflict.user_audiobook_exists'),
            HttpStatusCode.CONFLICT,
            ErrorType.CONFLICT
         );
      }
   }

   /**
    * Get all user-audiobook relationships with pagination and filtering
    */
   async getAllUserAudioBooks(queryParams: UserAudioBookQueryParams): Promise<{
      userAudioBooks: UserAudioBookDto[];
      totalCount: number;
   }> {
      try {
         const page = queryParams.page || 1;
         const limit = queryParams.limit || 10;
         const skip = (page - 1) * limit;
         const sortBy = queryParams.sortBy || 'createdAt';
         const sortOrder = queryParams.sortOrder || 'desc';

         // Build where clause
         const where: Prisma.UserAudioBookWhereInput = {};

         if (queryParams.userId) {
            where.userId = queryParams.userId;
         }

         if (queryParams.audiobookId) {
            where.audiobookId = queryParams.audiobookId;
         }

         if (queryParams.type) {
            where.type = queryParams.type;
         }

         // Get total count
         const totalCount = await this.prisma.userAudioBook.count({ where });

         // Get paginated results
         const userAudioBooks = await this.prisma.userAudioBook.findMany({
            where,
            skip,
            take: limit,
            orderBy: {
               [sortBy]: sortOrder
            }
         });

         return {
            userAudioBooks: userAudioBooks.map(toUserAudioBookDto),
            totalCount
         };
      } catch (error) {
         rethrowServiceError(error, { operation: 'getAllUserAudioBooks' }, MessageHandler.getErrorMessage('internal.fetch_user_audiobooks'));
      }
   }

   /**
    * Get user-audiobook relationship by ID
    */
   async getUserAudioBookById(id: string): Promise<UserAudioBookWithRelations> {
      try {
         const userAudioBook = await this.prisma.userAudioBook.findUnique({
            where: { id },
            include: {
               audiobook: {
                  select: {
                     id: true,
                     title: true,
                     author: true,
                     narrator: true,
                     coverImage: true
                  }
               }
            }
         });

         if (!userAudioBook) {
            throw new ApiError(
               MessageHandler.getErrorMessage('not_found.user_audiobook'),
               HttpStatusCode.NOT_FOUND,
               ErrorType.NOT_FOUND
            );
         }

         return this.resolveUserAudioBookWithRelations(userAudioBook);
      } catch (error) {
         if (error instanceof ApiError) {
            throw error;
         }
         throw new ApiError(
            MessageHandler.getErrorMessage('internal.fetch_user_audiobooks'),
            HttpStatusCode.INTERNAL_SERVER_ERROR,
            ErrorType.INTERNAL_ERROR
         );
      }
   }

   /**
    * Delete user-audiobook relationship
    */
   async deleteUserAudioBook(id: string): Promise<boolean> {
      try {
         // Ensure exists first for consistent 404
         const existing = await this.prisma.userAudioBook.findUnique({ where: { id } });
         if (!existing) {
            throw new ApiError(
               MessageHandler.getErrorMessage('not_found.user_audiobook'),
               HttpStatusCode.NOT_FOUND,
               ErrorType.NOT_FOUND
            );
         }

         await runWrite(this.prisma, async (tx) => tx.userAudioBook.delete({ where: { id } }));
         emitCacheInvalidation('user-audiobook', 'deleted', id);
         return true;
      } catch (error) {
         if (error instanceof ApiError) {
            throw error;
         }
         throw new ApiError(
            MessageHandler.getErrorMessage('internal.delete_user_audiobook'),
            HttpStatusCode.INTERNAL_SERVER_ERROR,
            ErrorType.INTERNAL_ERROR
         );
      }
   }

   /**
    * Get all audiobooks for a specific user
    */
   async getUserAudioBooksByUserId(
      userId: string,
      queryParams?: UserAudioBookQueryParams
   ): Promise<{ userAudioBooks: UserAudioBookDto[]; totalCount: number }> {
      return this.getAllUserAudioBooks({
         ...queryParams,
         userId
      });
   }

   /**
    * Get all users for a specific audiobook
    */
   async getUserAudioBooksByAudiobookId(
      audiobookId: string,
      queryParams?: UserAudioBookQueryParams
   ): Promise<{ userAudioBooks: UserAudioBookDto[]; totalCount: number }> {
      return this.getAllUserAudioBooks({
         ...queryParams,
         audiobookId
      });
   }

   /**
    * Get all user-audiobook relationships by type
    */
   async getUserAudioBooksByType(
      type: UserAudioBookType,
      queryParams?: UserAudioBookQueryParams
   ): Promise<{ userAudioBooks: UserAudioBookDto[]; totalCount: number }> {
      return this.getAllUserAudioBooks({
         ...queryParams,
         type
      });
   }

   private async resolveUserAudioBookWithRelations(
      userAudioBook: Parameters<typeof toUserAudioBookWithRelations>[0]
   ): Promise<UserAudioBookWithRelations> {
      const dto = toUserAudioBookWithRelations(userAudioBook);
      const resolvedMedia = await fileUrlService.resolveNestedAudiobookMedia(dto.audiobook);
      return {
         ...dto,
         audiobook: {
            ...dto.audiobook,
            ...resolvedMedia,
         },
      };
   }
}

