import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { OrganizationReviewController } from '../controllers/OrganizationReviewController';
import { ValidationMiddleware } from '../middleware/ValidationMiddleware';

export function createOrganizationReviewRoutes(prisma: PrismaClient): Router {
  const router = Router();
  const controller = new OrganizationReviewController(prisma);

  router.post(
    '/',
    ValidationMiddleware.validateCreateOrganizationReview,
    controller.createReview,
  );
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
    ValidationMiddleware.validateUpdateOrganizationReview,
    controller.updateReview,
  );
  router.delete('/:id', ValidationMiddleware.validateId, controller.deleteReview);

  return router;
}
