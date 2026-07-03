/**
 * Page Routes — authoring-mode page CRUD under chapters.
 */
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { PageController } from '../controllers/PageController';
import { ValidationMiddleware } from '../middleware/ValidationMiddleware';
import { requireContentCreator, requireContentManager } from '../middleware/RoleMiddleware';

export function createPageRoutes(prisma: PrismaClient): Router {
  const router = Router();
  const pageController = new PageController(prisma);

  router.get(
    '/chapters/:chapterId/pages',
    ValidationMiddleware.validateId,
    pageController.getPagesByChapterId,
  );

  router.get(
    '/pages/:id',
    ValidationMiddleware.validateId,
    pageController.getPageById,
  );

  router.post(
    '/chapters/:chapterId/pages',
    requireContentCreator(),
    ValidationMiddleware.validateId,
    ValidationMiddleware.validatePageCreation,
    pageController.createPage,
  );

  router.put(
    '/pages/:id',
    requireContentManager(),
    ValidationMiddleware.validateId,
    ValidationMiddleware.validatePageUpdate,
    pageController.updatePage,
  );

  router.delete(
    '/pages/:id',
    requireContentManager(),
    ValidationMiddleware.validateId,
    pageController.deletePage,
  );

  return router;
}
