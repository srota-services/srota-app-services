import { PrismaClient } from '@prisma/client';
import { AuthorProfileDto, toAuthorProfileDto, UpdateAuthorProfileDto } from '../models/AuthorProfileDto';
import { AuthorCreationMessage } from '../types/author-events';
import { ApiError } from '../types/ApiError';
import { MessageHandler } from '../utils/MessageHandler';
import { HttpStatusCode, ErrorType } from '../types/common';
import { fileUrlService } from './FileUrlService';
import { ImageAssetService } from './ImageAssetService';
import { mediaCleanupService } from './MediaCleanupService';
import { emitCacheInvalidation } from './DomainEventPublisher';
import fs from 'fs';
import { runWrite } from '../utils/prismaTransaction';

export class AuthorProfileService {
   private prisma: PrismaClient;
   private imageAssetService: ImageAssetService;

   constructor(prisma: PrismaClient) {
      this.prisma = prisma;
      this.imageAssetService = new ImageAssetService(prisma);
   }

   async createFromEvent(message: AuthorCreationMessage): Promise<AuthorProfileDto | null> {
      if (!message.authorId || typeof message.authorId !== 'string') {
         throw new Error('Invalid message: authorId is required and must be a string');
      }

      const existing = await this.prisma.authorProfile.findUnique({
         where: { authorId: message.authorId },
      });

      if (existing) {
         return fileUrlService.resolveAuthorProfileMedia(toAuthorProfileDto(existing));
      }

      const profile = await runWrite(this.prisma, async (tx) =>
         tx.authorProfile.create({
            data: {
               authorId: message.authorId,
               avatar: null,
            },
         }),
      );

      if (message.avatar !== undefined && message.avatar.trim().length > 0) {
         let tempPath: string | undefined;
         try {
            tempPath = await this.imageAssetService.resolveSourceImageToLocalPath(message.avatar.trim());
            const { primaryStorageKey } = await this.imageAssetService.generateAndStoreVariants(
               'author',
               message.authorId,
               tempPath,
            );
            const updated = await runWrite(this.prisma, async (tx) =>
               tx.authorProfile.update({
                  where: { authorId: message.authorId },
                  data: { avatar: primaryStorageKey },
               }),
            );
            emitCacheInvalidation('author-profile', 'created', updated.id, { authorId: message.authorId });
            return fileUrlService.resolveAuthorProfileMedia(toAuthorProfileDto(updated));
         } finally {
            if (tempPath && fs.existsSync(tempPath) && tempPath.includes('source-image-')) {
               fs.unlinkSync(tempPath);
            }
         }
      }

      emitCacheInvalidation('author-profile', 'created', profile.id, { authorId: message.authorId });
      return fileUrlService.resolveAuthorProfileMedia(toAuthorProfileDto(profile));
   }

   async getByAuthorId(authorId: string): Promise<AuthorProfileDto> {
      const profile = await this.prisma.authorProfile.findUnique({
         where: { authorId },
      });

      if (!profile) {
         throw new ApiError(
            MessageHandler.getErrorMessage('author_profiles.not_found'),
            HttpStatusCode.NOT_FOUND,
            ErrorType.NOT_FOUND,
         );
      }

      return fileUrlService.resolveAuthorProfileMedia(toAuthorProfileDto(profile));
   }

   async updateByAuthorId(
      authorId: string,
      data: UpdateAuthorProfileDto,
      avatarSourcePath?: string,
   ): Promise<AuthorProfileDto> {
      const existing = await this.prisma.authorProfile.findUnique({
         where: { authorId },
      });

      if (!existing) {
         throw new ApiError(
            MessageHandler.getErrorMessage('author_profiles.not_found'),
            HttpStatusCode.NOT_FOUND,
            ErrorType.NOT_FOUND,
         );
      }

      let updated = existing;

      if (avatarSourcePath) {
         const { primaryStorageKey } = await this.imageAssetService.generateAndStoreVariants(
            'author',
            authorId,
            avatarSourcePath,
         );
         updated = await runWrite(this.prisma, async (tx) =>
            tx.authorProfile.update({
               where: { authorId },
               data: { avatar: primaryStorageKey },
            }),
         );
      } else if (data.avatar !== undefined) {
         if (data.avatar !== existing.avatar) {
            await this.imageAssetService.deleteAssetsForEntity('author', authorId);
            await mediaCleanupService.deleteStoredFile(existing.avatar);
         }
         updated = await runWrite(this.prisma, async (tx) =>
            tx.authorProfile.update({
               where: { authorId },
               data: { avatar: data.avatar ?? null },
            }),
         );
      }

      emitCacheInvalidation('author-profile', 'updated', updated.id, { authorId });
      return fileUrlService.resolveAuthorProfileMedia(toAuthorProfileDto(updated));
   }

   async deleteByAuthorId(authorId: string): Promise<void> {
      const existing = await this.prisma.authorProfile.findUnique({
         where: { authorId },
      });

      if (!existing) {
         throw new ApiError(
            MessageHandler.getErrorMessage('author_profiles.not_found'),
            HttpStatusCode.NOT_FOUND,
            ErrorType.NOT_FOUND,
         );
      }

      await this.imageAssetService.deleteAssetsForEntity('author', authorId);
      await mediaCleanupService.deleteStoredFile(existing.avatar);
      await runWrite(this.prisma, async (tx) => tx.authorProfile.delete({ where: { authorId } }));
      emitCacheInvalidation('author-profile', 'deleted', existing.id, { authorId });
   }
}
