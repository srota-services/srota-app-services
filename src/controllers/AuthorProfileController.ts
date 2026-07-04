import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthorProfileService } from '../services/AuthorProfileService';
import { ResponseHandler } from '../utils/ResponseHandler';
import { ErrorHandler } from '../middleware/ErrorHandler';
import { MessageHandler } from '../utils/MessageHandler';
import { AuthenticatedRequest } from '../types/auth';
import { UpdateAuthorProfileDto } from '../models/AuthorProfileDto';
import { authClient } from '../clients/AuthClient';

function getBearerToken(req: Request): string | undefined {
   const authorization = req.headers.authorization;
   if (!authorization || !authorization.startsWith('Bearer ')) {
      return undefined;
   }
   const token = authorization.slice(7).trim();
   return token.length > 0 ? token : undefined;
}

export class AuthorProfileController {
   private authorProfileService: AuthorProfileService;

   constructor(prisma: PrismaClient) {
      this.authorProfileService = new AuthorProfileService(prisma);
   }

   private async resolveCallerAuthorId(req: Request): Promise<string> {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      const token = getBearerToken(req);

      if (!userId || !token) {
         throw new Error('Authentication required');
      }

      const author = await authClient.getAuthorByUserId(userId, token);
      if (!author) {
         throw new Error('Author profile not found');
      }

      return author.id;
   }

   getMyProfile = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authorId = await this.resolveCallerAuthorId(req);
      const profile = await this.authorProfileService.getByAuthorId(authorId);
      ResponseHandler.success(
         res,
         profile,
         MessageHandler.getSuccessMessage('author_profiles.retrieved'),
      );
   });

   updateMyProfile = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authorId = await this.resolveCallerAuthorId(req);
      const uploadedAvatar = (req as Request & { profileImageFile?: Express.Multer.File }).profileImageFile;

      const updateData: UpdateAuthorProfileDto = {};

      if (uploadedAvatar) {
         const profile = await this.authorProfileService.updateByAuthorId(
            authorId,
            req.body.discoverable !== undefined && typeof req.body.discoverable === 'boolean'
               ? { discoverable: req.body.discoverable }
               : {},
            uploadedAvatar.path,
         );
         ResponseHandler.success(
            res,
            profile,
            MessageHandler.getSuccessMessage('author_profiles.updated'),
         );
         return;
      } else if (req.body.avatar !== undefined) {
         updateData.avatar = typeof req.body.avatar === 'string' && req.body.avatar.trim().length > 0
            ? req.body.avatar.trim()
            : null;
      }

      if (req.body.discoverable !== undefined) {
         if (typeof req.body.discoverable !== 'boolean') {
            ResponseHandler.validationError(
               res,
               MessageHandler.getErrorMessage('validation.discoverable_invalid'),
            );
            return;
         }
         updateData.discoverable = req.body.discoverable;
      }

      if (updateData.avatar === undefined && updateData.discoverable === undefined) {
         ResponseHandler.validationError(
            res,
            MessageHandler.getErrorMessage('validation.no_update_fields'),
         );
         return;
      }

      const profile = await this.authorProfileService.updateByAuthorId(authorId, updateData);
      ResponseHandler.success(
         res,
         profile,
         MessageHandler.getSuccessMessage('author_profiles.updated'),
      );
   });

   deleteMyProfile = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authorId = await this.resolveCallerAuthorId(req);
      await this.authorProfileService.deleteByAuthorId(authorId);
      ResponseHandler.success(
         res,
         { deleted: true },
         MessageHandler.getSuccessMessage('author_profiles.deleted'),
      );
   });
}
