/**
 * Listening history routes
 */
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { ListeningHistoryController } from '../controllers/ListeningHistoryController';
import { ValidationMiddleware } from '../middleware/ValidationMiddleware';

export function createListeningHistoryRoutes(prisma: PrismaClient): Router {
   const router = Router();
   const controller = new ListeningHistoryController(prisma);

   router.get(
      '/user/:userId',
      ValidationMiddleware.validateUserIdParam,
      ValidationMiddleware.validatePagination,
      ValidationMiddleware.sanitizeQueryParams,
      controller.getListeningHistoryByUserId
   );

   return router;
}
