/**
 * Review Routes
 */
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { ReviewController } from '../controllers/ReviewController';
import { ValidationMiddleware } from '../middleware/ValidationMiddleware';
import { requireRegisteredUser } from '../middleware/RoleMiddleware';

export function createReviewRoutes(prisma: PrismaClient): Router {
   const router = Router();
   const controller = new ReviewController(prisma);

   router.post('/', requireRegisteredUser(), ValidationMiddleware.validateCreateReview, controller.createReview);
   router.get(
      '/',
      ValidationMiddleware.validatePagination,
      ValidationMiddleware.sanitizeQueryParams,
      controller.getReviews
   );
   router.get('/:id', ValidationMiddleware.validateId, controller.getReviewById);
   router.put('/:id', requireRegisteredUser(), ValidationMiddleware.validateId, ValidationMiddleware.validateUpdateReview, controller.updateReview);
   router.delete('/:id', requireRegisteredUser(), ValidationMiddleware.validateId, controller.deleteReview);

   return router;
}
