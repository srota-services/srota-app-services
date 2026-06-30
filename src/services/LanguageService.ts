/**
 * Language Service Layer
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { LanguageDto, toLanguageDto } from '../models/LanguageDto';
import { ApiError } from '../types/ApiError';
import { MessageHandler } from '../utils/MessageHandler';
import { HttpStatusCode, ErrorType } from '../types/common';
import { emitCacheInvalidation } from './DomainEventPublisher';
import { runWrite } from '../utils/prismaTransaction';
import { rethrowServiceError } from '../utils/serviceError';

export class LanguageService {
   private prisma: PrismaClient;

   constructor(prisma: PrismaClient) {
      this.prisma = prisma;
   }

   async createLanguage(name: string, code: string): Promise<LanguageDto> {
      const trimmedName = name.trim();
      const normalizedCode = code.trim().toLowerCase();

      try {
         const existing = await this.prisma.language.findFirst({
            where: {
               OR: [
                  { name: { equals: trimmedName, mode: 'insensitive' } },
                  { code: normalizedCode },
               ],
            },
         });

         if (existing) {
            const messageKey =
               existing.code === normalizedCode
                  ? 'languages.code_exists'
                  : 'languages.name_exists';
            throw new ApiError(
               MessageHandler.getErrorMessage(messageKey),
               HttpStatusCode.BAD_REQUEST,
               ErrorType.VALIDATION_ERROR,
            );
         }

         const created = await runWrite(this.prisma, async (tx) =>
            tx.language.create({
               data: { name: trimmedName, code: normalizedCode },
            }),
         );
         emitCacheInvalidation('language', 'created', created.id);
         return toLanguageDto(created);
      } catch (error) {
         if (error instanceof ApiError) {
            throw error;
         }
         throw new ApiError(
            MessageHandler.getErrorMessage('languages.create_failed'),
            HttpStatusCode.INTERNAL_SERVER_ERROR,
            ErrorType.INTERNAL_ERROR,
         );
      }
   }

   async getAllLanguages(): Promise<LanguageDto[]> {
      try {
         const languages = await this.prisma.language.findMany({
            orderBy: { name: 'asc' },
         });
         return languages.map(toLanguageDto);
      } catch (error) {
         rethrowServiceError(error, { operation: 'getAllLanguages' }, MessageHandler.getErrorMessage('languages.fetch_failed'));
      }
   }

   async getLanguageById(id: string): Promise<LanguageDto> {
      try {
         const language = await this.prisma.language.findUnique({ where: { id } });
         if (!language) {
            throw new ApiError(
               MessageHandler.getErrorMessage('languages.not_found'),
               HttpStatusCode.NOT_FOUND,
               ErrorType.NOT_FOUND,
            );
         }
         return toLanguageDto(language);
      } catch (error) {
         if (error instanceof ApiError) {
            throw error;
         }
         throw new ApiError(
            MessageHandler.getErrorMessage('languages.fetch_failed'),
            HttpStatusCode.INTERNAL_SERVER_ERROR,
            ErrorType.INTERNAL_ERROR,
         );
      }
   }

   async updateLanguage(id: string, name: string, code: string): Promise<LanguageDto> {
      const trimmedName = name.trim();
      const normalizedCode = code.trim().toLowerCase();

      try {
         const existingById = await this.prisma.language.findUnique({ where: { id } });
         if (!existingById) {
            throw new ApiError(
               MessageHandler.getErrorMessage('languages.not_found'),
               HttpStatusCode.NOT_FOUND,
               ErrorType.NOT_FOUND,
            );
         }

         const duplicate = await this.prisma.language.findFirst({
            where: {
               OR: [
                  { name: { equals: trimmedName, mode: 'insensitive' }, NOT: { id } },
                  { code: normalizedCode, NOT: { id } },
               ],
            },
         });

         if (duplicate) {
            const messageKey =
               duplicate.code === normalizedCode
                  ? 'languages.code_exists'
                  : 'languages.name_exists';
            throw new ApiError(
               MessageHandler.getErrorMessage(messageKey),
               HttpStatusCode.BAD_REQUEST,
               ErrorType.VALIDATION_ERROR,
            );
         }

         const updated = await runWrite(this.prisma, async (tx) =>
            tx.language.update({
               where: { id },
               data: { name: trimmedName, code: normalizedCode },
            }),
         );
         emitCacheInvalidation('language', 'updated', id);
         return toLanguageDto(updated);
      } catch (error) {
         if (error instanceof ApiError) {
            throw error;
         }
         throw new ApiError(
            MessageHandler.getErrorMessage('languages.update_failed'),
            HttpStatusCode.INTERNAL_SERVER_ERROR,
            ErrorType.INTERNAL_ERROR,
         );
      }
   }

   async deleteLanguage(id: string): Promise<boolean> {
      try {
         const existing = await this.prisma.language.findUnique({ where: { id } });
         if (!existing) {
            throw new ApiError(
               MessageHandler.getErrorMessage('languages.not_found'),
               HttpStatusCode.NOT_FOUND,
               ErrorType.NOT_FOUND,
            );
         }

         await runWrite(this.prisma, async (tx) => tx.language.delete({ where: { id } }));
         emitCacheInvalidation('language', 'deleted', id);
         return true;
      } catch (error) {
         if (error instanceof ApiError) {
            throw error;
         }
         if (
            error instanceof Prisma.PrismaClientKnownRequestError
            && error.code === 'P2003'
         ) {
            throw new ApiError(
               MessageHandler.getErrorMessage('languages.in_use'),
               HttpStatusCode.BAD_REQUEST,
               ErrorType.VALIDATION_ERROR,
            );
         }
         throw new ApiError(
            MessageHandler.getErrorMessage('languages.delete_failed'),
            HttpStatusCode.INTERNAL_SERVER_ERROR,
            ErrorType.INTERNAL_ERROR,
         );
      }
   }
}
