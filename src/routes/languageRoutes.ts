/**
 * Language Routes
 */
import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { LanguageController } from '../controllers/LanguageController';
import { ValidationMiddleware } from '../middleware/ValidationMiddleware';
import { requireGlobalAdmin } from '../middleware/RoleMiddleware';
import { ResponseHandler } from '../utils/ResponseHandler';
import { MessageHandler } from '../utils/MessageHandler';

const LANGUAGE_CODE_REGEX = /^[a-z0-9-]+$/;

function validateLanguageBody(req: Request, res: Response, next: NextFunction): void {
   const { name, code } = req.body ?? {};

   if (typeof name !== 'string' || typeof code !== 'string') {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.invalid_request'));
      return;
   }

   const trimmedName = name.trim();
   const trimmedCode = code.trim().toLowerCase();

   if (trimmedName.length === 0 || trimmedName.length > 100) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.language_name_invalid'));
      return;
   }

   if (trimmedCode.length === 0 || trimmedCode.length > 10 || !LANGUAGE_CODE_REGEX.test(trimmedCode)) {
      ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.language_code_invalid'));
      return;
   }

   req.body.name = trimmedName;
   req.body.code = trimmedCode;
   next();
}

export function createLanguageRoutes(prisma: PrismaClient): Router {
   const router = Router();
   const languageController = new LanguageController(prisma);

   router.get('/', languageController.getAllLanguages);
   router.get('/:id', ValidationMiddleware.validateId, languageController.getLanguageById);
   router.post('/', requireGlobalAdmin(), validateLanguageBody, languageController.createLanguage);
   router.put(
      '/:id',
      requireGlobalAdmin(),
      ValidationMiddleware.validateId,
      validateLanguageBody,
      languageController.updateLanguage,
   );
   router.delete(
      '/:id',
      requireGlobalAdmin(),
      ValidationMiddleware.validateId,
      languageController.deleteLanguage,
   );

   return router;
}
