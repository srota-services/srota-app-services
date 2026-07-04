import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthorReviewController } from '../controllers/AuthorReviewController';
import { ValidationMiddleware } from '../middleware/ValidationMiddleware';

export function createAuthorReviewRoutes(prisma: PrismaClient): Router {
  const router = Router();
  const controller = new AuthorReviewController(prisma);

  router.post('/', ValidationMiddleware.validateCreateAuthorReview, controller.createReview);
  router.get(
    '/',
    ValidationMiddleware.validatePagination,
    ValidationMiddleware.sanitizeQueryParams,
    controller.getReviews,
  );
  router.get('/:id', ValidationMiddleware.validateId, controller.getReviewById);
  router.put(
    '/:id',
    ValidationMiddleware.validateId,
    ValidationMiddleware.validateUpdateAuthorReview,
    controller.updateReview,
  );
  router.delete('/:id', ValidationMiddleware.validateId, controller.deleteReview);

  return router;
}
