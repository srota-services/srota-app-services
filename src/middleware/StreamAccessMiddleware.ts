import { Response, NextFunction, Request } from 'express';
import { PrismaClient } from '@prisma/client';
import { SubscriptionAccessService } from '../services/SubscriptionAccessService';
import { ResponseHandler } from '../utils/ResponseHandler';
import { MessageHandler } from '../utils/MessageHandler';
import { AuthenticatedRequest } from '../types/auth';
import { isGuestRole } from '../constants/authRoles';

function extractBearerToken(req: Request): string | null {
   const authHeader = req.headers.authorization;
   if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      return token.length > 0 ? token : null;
   }

   const queryToken = req.query['access_token'];
   if (typeof queryToken === 'string' && queryToken.trim().length > 0) {
      return queryToken.trim();
   }

   return null;
}

export function requireChapterStreamAccess(prisma: PrismaClient) {
   const subscriptionAccessService = new SubscriptionAccessService();

   return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
         const chapterId = req.params['chapterId'];
         if (!chapterId) {
            next();
            return;
         }

         const chapter = await prisma.chapter.findUnique({
            where: { id: chapterId },
            include: {
               audiobook: {
                  select: {
                     subscriptionGatingMode: true,
                     minSubscriptionTier: true,
                     isPublic: true,
                     isActive: true,
                  },
               },
            },
         });

         if (!chapter) {
            ResponseHandler.notFound(res, MessageHandler.getErrorMessage('not_found.chapter'));
            return;
         }

         const authReq = req as AuthenticatedRequest;
         const userRole = authReq.user?.role;

         if (isGuestRole(userRole)) {
            if (!chapter.isActive || !chapter.audiobook.isActive) {
               ResponseHandler.forbidden(
                  res,
                  MessageHandler.getErrorMessage('forbidden.audiobook_access'),
               );
               return;
            }
         }

         const requiredTier = subscriptionAccessService.resolveChapterRequiredTier(
            {
               subscriptionGatingMode: chapter.audiobook.subscriptionGatingMode,
               minSubscriptionTier: chapter.audiobook.minSubscriptionTier,
            },
            { minSubscriptionTier: chapter.minSubscriptionTier },
         );

         const access = await subscriptionAccessService.evaluateAccess(
            requiredTier,
            authReq.user?.id ?? null,
            extractBearerToken(req),
         );

         if (!access.canAccess) {
            ResponseHandler.forbidden(
               res,
               access.message ?? MessageHandler.getErrorMessage('forbidden.subscription_required'),
            );
            return;
         }

         next();
      } catch (_error) {
         ResponseHandler.internalError(res, MessageHandler.getErrorMessage('internal.default'));
      }
   };
}
