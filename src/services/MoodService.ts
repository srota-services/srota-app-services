/**
 * Mood Service Layer
 * Handles business logic and database operations for mood management
 */
import { PrismaClient } from '@prisma/client';
import {
   MoodSummaryDto,
   MoodDetailDto,
   MoodDto,
   CreateMoodDto,
   CreateMoodAttributeDto,
   UpdateMoodDto,
   toMoodDto,
   isValidHexcode,
} from '../models/MoodDto';
import { ApiError } from '../types/ApiError';
import { MessageHandler } from '../utils/MessageHandler';
import { HttpStatusCode, ErrorType } from '../types/common';
import { emitCacheInvalidation } from './DomainEventPublisher';
import { AudioBookService } from './AudioBookService';

const moodAttributesInclude = {
   moodAttributes: {
      orderBy: { createdAt: 'asc' as const }
   }
};

export class MoodService {
   private prisma: PrismaClient;
   private audioBookService: AudioBookService;

   constructor(prisma: PrismaClient, audioBookService?: AudioBookService) {
      this.prisma = prisma;
      this.audioBookService = audioBookService ?? new AudioBookService(prisma);
   }

   async createMood(createMoodDto: CreateMoodDto): Promise<MoodSummaryDto> {
      const trimmedName = createMoodDto.name.trim();
      const hexcode = createMoodDto.hexcode.trim();
      const icon = createMoodDto.icon.trim();
      const descriptionIcon = createMoodDto.descriptionIcon.trim();
      const attributes = this.normalizeAttributes(createMoodDto.attributes);

      if (!isValidHexcode(hexcode)) {
         throw new ApiError(
            MessageHandler.getErrorMessage('moods.invalid_hexcode'),
            HttpStatusCode.BAD_REQUEST,
            ErrorType.VALIDATION_ERROR
         );
      }

      try {
         const existing = await this.prisma.mood.findFirst({
            where: { name: { equals: trimmedName, mode: 'insensitive' } }
         });
         if (existing) {
            throw new ApiError(
               MessageHandler.getErrorMessage('moods.name_exists'),
               HttpStatusCode.BAD_REQUEST,
               ErrorType.VALIDATION_ERROR
            );
         }

         const description = this.normalizeDescription(createMoodDto.description);

         const created = await this.prisma.mood.create({
            data: {
               name: trimmedName,
               description,
               descriptionIcon,
               hexcode,
               icon,
               ...(attributes.length > 0
                  ? { moodAttributes: { create: attributes } }
                  : {})
            }
         });

         emitCacheInvalidation('mood', 'created', created.id);
         return toMoodDto(created);
      } catch (error) {
         if (error instanceof ApiError) {
            throw error;
         }
         throw new ApiError(
            MessageHandler.getErrorMessage('moods.create_failed'),
            HttpStatusCode.INTERNAL_SERVER_ERROR,
            ErrorType.INTERNAL_ERROR
         );
      }
   }

   async getAllMoods(): Promise<MoodSummaryDto[]> {
      try {
         const moods = await this.prisma.mood.findMany({
            orderBy: { name: 'asc' }
         });
         return moods.map(mood => toMoodDto(mood));
      } catch (_error) {
         throw new ApiError(
            MessageHandler.getErrorMessage('moods.fetch_failed'),
            HttpStatusCode.INTERNAL_SERVER_ERROR,
            ErrorType.INTERNAL_ERROR
         );
      }
   }

   async getMoodById(id: string, accessToken?: string, guestCatalogOnly = false): Promise<MoodDetailDto> {
      try {
         const mood = await this.prisma.mood.findUnique({
            where: { id },
            include: moodAttributesInclude
         });

         if (!mood) {
            throw new ApiError(
               MessageHandler.getErrorMessage('moods.not_found'),
               HttpStatusCode.NOT_FOUND,
               ErrorType.NOT_FOUND
            );
         }

         const audiobooks = await this.audioBookService.getAudioBooksByMoodId(id, accessToken, guestCatalogOnly);

         return {
            ...(toMoodDto(mood, true) as MoodDto),
            audiobooks,
         };
      } catch (error) {
         if (error instanceof ApiError) {
            throw error;
         }
         throw new ApiError(
            MessageHandler.getErrorMessage('moods.fetch_failed'),
            HttpStatusCode.INTERNAL_SERVER_ERROR,
            ErrorType.INTERNAL_ERROR
         );
      }
   }

   async updateMood(id: string, updateMoodDto: UpdateMoodDto): Promise<MoodSummaryDto> {
      try {
         const existing = await this.prisma.mood.findUnique({ where: { id } });
         if (!existing) {
            throw new ApiError(
               MessageHandler.getErrorMessage('moods.not_found'),
               HttpStatusCode.NOT_FOUND,
               ErrorType.NOT_FOUND
            );
         }

         const data: {
            name?: string;
            description?: string | null;
            descriptionIcon?: string;
            hexcode?: string;
            icon?: string;
         } = {};

         if (updateMoodDto.name !== undefined) {
            const trimmedName = updateMoodDto.name.trim();
            const duplicate = await this.prisma.mood.findFirst({
               where: {
                  name: { equals: trimmedName, mode: 'insensitive' },
                  NOT: { id }
               }
            });
            if (duplicate) {
               throw new ApiError(
                  MessageHandler.getErrorMessage('moods.name_exists'),
                  HttpStatusCode.BAD_REQUEST,
                  ErrorType.VALIDATION_ERROR
               );
            }
            data.name = trimmedName;
         }

         if (updateMoodDto.description !== undefined) {
            data.description = this.normalizeDescription(updateMoodDto.description);
         }

         if (updateMoodDto.descriptionIcon !== undefined) {
            data.descriptionIcon = updateMoodDto.descriptionIcon.trim();
         }

         if (updateMoodDto.hexcode !== undefined) {
            const hexcode = updateMoodDto.hexcode.trim();
            if (!isValidHexcode(hexcode)) {
               throw new ApiError(
                  MessageHandler.getErrorMessage('moods.invalid_hexcode'),
                  HttpStatusCode.BAD_REQUEST,
                  ErrorType.VALIDATION_ERROR
               );
            }
            data.hexcode = hexcode;
         }

         if (updateMoodDto.icon !== undefined) {
            data.icon = updateMoodDto.icon.trim();
         }

         if (updateMoodDto.attributes !== undefined) {
            const attributes = this.normalizeAttributes(updateMoodDto.attributes);
            await this.prisma.moodAttribute.deleteMany({ where: { moodId: id } });
            if (attributes.length > 0) {
               await this.prisma.moodAttribute.createMany({
                  data: attributes.map(attribute => ({
                     moodId: id,
                     icon: attribute.icon,
                     description: attribute.description
                  }))
               });
            }
         }

         const updated = await this.prisma.mood.update({
            where: { id },
            data
         });

         emitCacheInvalidation('mood', 'updated', id);
         return toMoodDto(updated);
      } catch (error) {
         if (error instanceof ApiError) {
            throw error;
         }
         throw new ApiError(
            MessageHandler.getErrorMessage('moods.update_failed'),
            HttpStatusCode.INTERNAL_SERVER_ERROR,
            ErrorType.INTERNAL_ERROR
         );
      }
   }

   async deleteMood(id: string): Promise<boolean> {
      try {
         const existing = await this.prisma.mood.findUnique({ where: { id } });
         if (!existing) {
            throw new ApiError(
               MessageHandler.getErrorMessage('moods.not_found'),
               HttpStatusCode.NOT_FOUND,
               ErrorType.NOT_FOUND
            );
         }

         await this.prisma.mood.delete({ where: { id } });
         emitCacheInvalidation('mood', 'deleted', id);
         return true;
      } catch (error) {
         if (error instanceof ApiError) {
            throw error;
         }
         throw new ApiError(
            MessageHandler.getErrorMessage('moods.delete_failed'),
            HttpStatusCode.INTERNAL_SERVER_ERROR,
            ErrorType.INTERNAL_ERROR
         );
      }
   }

   private normalizeDescription(description?: string | null): string | null {
      if (description === undefined || description === null) {
         return null;
      }
      const trimmed = description.trim();
      return trimmed.length > 0 ? trimmed : null;
   }

   private normalizeAttributes(attributes?: CreateMoodAttributeDto[]): CreateMoodAttributeDto[] {
      if (!attributes || attributes.length === 0) {
         return [];
      }

      return attributes.map(attribute => ({
         icon: attribute.icon.trim(),
         description: attribute.description.trim()
      }));
   }
}
