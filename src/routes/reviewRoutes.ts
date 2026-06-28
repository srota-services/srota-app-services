/**
 * Review Routes
 */
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { ReviewController } from '../controllers/ReviewController';
import { ValidationMiddleware } from '../middleware/ValidationMiddleware';

export function createReviewRoutes(prisma: PrismaClient): Router {
   const router = Router();
   const controller = new ReviewController(prisma);

   router.post('/', ValidationMiddleware.validateCreateReview, controller.createReview);
   router.get(
      '/',
      ValidationMiddleware.validatePagination,
      ValidationMiddleware.sanitizeQueryParams,
      controller.getReviews
   );
   router.get('/:id', ValidationMiddleware.validateId, controller.getReviewById);
   router.put('/:id', ValidationMiddleware.validateId, ValidationMiddleware.validateUpdateReview, controller.updateReview);
   router.delete('/:id', ValidationMiddleware.validateId, controller.deleteReview);

   return router;
}
