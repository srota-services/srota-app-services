/**
 * Tag Service Layer
 * Handles business logic and database operations for tag management following OOP principles
 */
import { PrismaClient } from '@prisma/client';
import { TagDto, CreateTagDto, UpdateTagDto, toTagDto } from '../models/TagDto';
import { ApiError } from '../types/ApiError';
import { MessageHandler } from '../utils/MessageHandler';
import { HttpStatusCode, ErrorType } from '../types/common';
import { emitCacheInvalidation } from './DomainEventPublisher';
import { runWrite } from '../utils/prismaTransaction';
import { rethrowServiceError } from '../utils/serviceError';

export class TagService {
   private prisma: PrismaClient;

   constructor(prisma: PrismaClient) {
      this.prisma = prisma;
   }

   /**
    * Get all available tags
    * Returns all tags sorted by name in ascending order
    */
   async getAllTags(): Promise<TagDto[]> {
      try {
         const tags = await this.prisma.tag.findMany({
            orderBy: {
               name: 'asc'
            }
         });

         return tags.map(tag => toTagDto(tag));
      } catch (error) {
         rethrowServiceError(error, { operation: 'getAllTags' }, MessageHandler.getErrorMessage('tags.fetch_failed'));
      }
   }

   /**
    * Get tag by ID
    * Returns a specific tag by its unique identifier
    */
   async getTagById(id: string): Promise<TagDto> {
      try {
         const tag = await this.prisma.tag.findUnique({
            where: { id }
         });

         if (!tag) {
            throw new ApiError(
               MessageHandler.getErrorMessage('tags.not_found'),
               HttpStatusCode.NOT_FOUND,
               ErrorType.NOT_FOUND
            );
         }

         return toTagDto(tag);
      } catch (error) {
         if (error instanceof ApiError) {
            throw error;
         }

         throw new ApiError(
            MessageHandler.getErrorMessage('tags.fetch_failed'),
            HttpStatusCode.INTERNAL_SERVER_ERROR,
            ErrorType.INTERNAL_ERROR
         );
      }
   }

   /**
    * Create a new tag
    * Creates a global tag (not associated with any user)
    */
   async createTag(createTagDto: CreateTagDto): Promise<TagDto> {
      try {
         // Validate tag name
         if (!createTagDto.name || createTagDto.name.trim().length === 0) {
            throw new ApiError(
               MessageHandler.getErrorMessage('tags.invalid_name'),
               HttpStatusCode.BAD_REQUEST,
               ErrorType.VALIDATION_ERROR
            );
         }

         const trimmedName = createTagDto.name.trim();

         // Check if tag with same name already exists
         const existingTag = await this.prisma.tag.findUnique({
            where: {
               name: trimmedName
            }
         });

         if (existingTag) {
            throw new ApiError(
               MessageHandler.getErrorMessage('tags.already_exists'),
               HttpStatusCode.CONFLICT,
               ErrorType.CONFLICT
            );
         }

         const tag = await runWrite(this.prisma, async (tx) =>
            tx.tag.create({
               data: {
                  name: trimmedName
               }
            }),
         );

         emitCacheInvalidation('tag', 'created', tag.id);
         return toTagDto(tag);
      } catch (error) {
         if (error instanceof ApiError) {
            throw error;
         }

         if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
            throw new ApiError(
               MessageHandler.getErrorMessage('tags.already_exists'),
               HttpStatusCode.CONFLICT,
               ErrorType.CONFLICT
            );
         }

         throw new ApiError(
            MessageHandler.getErrorMessage('tags.create_failed'),
            HttpStatusCode.INTERNAL_SERVER_ERROR,
            ErrorType.INTERNAL_ERROR
         );
      }
   }

   /**
    * Update an existing tag
    * Updates a global tag (any authenticated user can update any tag)
    */
   async updateTag(id: string, updateTagDto: UpdateTagDto): Promise<TagDto> {
      try {
         // Check if tag exists
         const existingTag = await this.prisma.tag.findUnique({
            where: { id }
         });

         if (!existingTag) {
            throw new ApiError(
               MessageHandler.getErrorMessage('tags.not_found'),
               HttpStatusCode.NOT_FOUND,
               ErrorType.NOT_FOUND
            );
         }

         // Validate new name if provided
         if (updateTagDto.name !== undefined) {
            if (!updateTagDto.name || updateTagDto.name.trim().length === 0) {
               throw new ApiError(
                  MessageHandler.getErrorMessage('tags.invalid_name'),
                  HttpStatusCode.BAD_REQUEST,
                  ErrorType.VALIDATION_ERROR
               );
            }

            const trimmedName = updateTagDto.name.trim();

            // Check if another tag with the same name already exists
            if (trimmedName !== existingTag.name) {
               const duplicateTag = await this.prisma.tag.findUnique({
                  where: {
                     name: trimmedName
                  }
               });

               if (duplicateTag) {
                  throw new ApiError(
                     MessageHandler.getErrorMessage('tags.already_exists'),
                     HttpStatusCode.CONFLICT,
                     ErrorType.CONFLICT
                  );
               }
            }
         }

         const tag = await runWrite(this.prisma, async (tx) =>
            tx.tag.update({
               where: { id },
               data: {
                  ...(updateTagDto.name && { name: updateTagDto.name.trim() })
               }
            }),
         );

         emitCacheInvalidation('tag', 'updated', id);
         return toTagDto(tag);
      } catch (error) {
         if (error instanceof ApiError) {
            throw error;
         }

         if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
            throw new ApiError(
               MessageHandler.getErrorMessage('tags.already_exists'),
               HttpStatusCode.CONFLICT,
               ErrorType.CONFLICT
            );
         }

         throw new ApiError(
            MessageHandler.getErrorMessage('tags.update_failed'),
            HttpStatusCode.INTERNAL_SERVER_ERROR,
            ErrorType.INTERNAL_ERROR
         );
      }
   }

   /**
    * Delete an existing tag
    * Deletes a global tag and all associated audiobook-tag relationships (cascade delete)
    */
   async deleteTag(id: string): Promise<void> {
      try {
         // Check if tag exists
         const existingTag = await this.prisma.tag.findUnique({
            where: { id }
         });

         if (!existingTag) {
            throw new ApiError(
               MessageHandler.getErrorMessage('tags.not_found'),
               HttpStatusCode.NOT_FOUND,
               ErrorType.NOT_FOUND
            );
         }

         // Delete the tag (cascade delete will handle AudioBookTag relationships)
         await runWrite(this.prisma, async (tx) => tx.tag.delete({ where: { id } }));
         emitCacheInvalidation('tag', 'deleted', id);
      } catch (error) {
         if (error instanceof ApiError) {
            throw error;
         }

         throw new ApiError(
            MessageHandler.getErrorMessage('tags.delete_failed'),
            HttpStatusCode.INTERNAL_SERVER_ERROR,
            ErrorType.INTERNAL_ERROR
         );
      }
   }
}

