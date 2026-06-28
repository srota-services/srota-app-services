/**
 * Comment Routes
 */
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { CommentController } from '../controllers/CommentController';
import { ValidationMiddleware } from '../middleware/ValidationMiddleware';

export function createCommentRoutes(prisma: PrismaClient): Router {
   const router = Router();
   const controller = new CommentController(prisma);

   router.post('/', ValidationMiddleware.validateCreateComment, controller.createComment);
   router.get(
      '/',
      ValidationMiddleware.validatePagination,
      ValidationMiddleware.sanitizeQueryParams,
      controller.getComments
   );
   router.get('/:id', ValidationMiddleware.validateId, controller.getCommentById);
   router.put('/:id', ValidationMiddleware.validateId, ValidationMiddleware.validateUpdateComment, controller.updateComment);
   router.delete('/:id', ValidationMiddleware.validateId, controller.deleteComment);

   return router;
}
