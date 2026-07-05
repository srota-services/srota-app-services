/**
 * Language Controller
 */
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { LanguageService } from '../services/LanguageService';
import { ResponseHandler } from '../utils/ResponseHandler';
import { ErrorHandler } from '../middleware/ErrorHandler';
import { MessageHandler } from '../utils/MessageHandler';

export class LanguageController {
   private languageService: LanguageService;

   constructor(prisma: PrismaClient) {
      this.languageService = new LanguageService(prisma);
   }

   /**
    * @swagger
    * /api/v1/languages:
    *   post:
    *     summary: Create a new language
    *     description: Requires GLOBAL_ADMIN role
    *     tags: [Languages]
    *     security:
    *       - bearerAuth: []
    *     requestBody:
    *       required: true
    *       content:
    *         application/json:
    *           schema:
    *             type: object
    *             required: [name, code]
    *             properties:
    *               name:
    *                 type: string
    *                 example: Hindi
    *               code:
    *                 type: string
    *                 example: hi
    *     responses:
    *       201:
    *         description: Language created successfully
    *       400:
    *         $ref: '#/components/responses/ValidationError'
    *       403:
    *         $ref: '#/components/responses/Forbidden'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   createLanguage = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { name, code } = req.body as { name: string; code: string };
      const created = await this.languageService.createLanguage(name, code);
      ResponseHandler.success(res, created, MessageHandler.getSuccessMessage('languages.created'), 201);
   });

   /**
    * @swagger
    * /api/v1/languages:
    *   get:
    *     summary: Get all languages
    *     tags: [Languages]
    *     responses:
    *       200:
    *         description: Languages retrieved successfully
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   getAllLanguages = ErrorHandler.asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      const languages = await this.languageService.getAllLanguages();
      ResponseHandler.success(res, languages, MessageHandler.getSuccessMessage('languages.retrieved'));
   });

   /**
    * @swagger
    * /api/v1/languages/{id}:
    *   get:
    *     summary: Get a language by ID
    *     tags: [Languages]
    *     parameters:
    *       - name: id
    *         in: path
    *         required: true
    *         schema:
    *           type: string
    *     responses:
    *       200:
    *         description: Language retrieved successfully
    *       404:
    *         $ref: '#/components/responses/NotFound'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   getLanguageById = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { id } = req.params as { id: string };
      const language = await this.languageService.getLanguageById(id);
      ResponseHandler.success(res, language, MessageHandler.getSuccessMessage('languages.retrieved'));
   });

   /**
    * @swagger
    * /api/v1/languages/{id}:
    *   put:
    *     summary: Update a language by ID
    *     description: Requires GLOBAL_ADMIN role
    *     tags: [Languages]
    *     security:
    *       - bearerAuth: []
    *     parameters:
    *       - name: id
    *         in: path
    *         required: true
    *         schema:
    *           type: string
    *     requestBody:
    *       required: true
    *       content:
    *         application/json:
    *           schema:
    *             type: object
    *             required: [name, code]
    *             properties:
    *               name:
    *                 type: string
    *               code:
    *                 type: string
    *     responses:
    *       200:
    *         description: Language updated successfully
    *       400:
    *         $ref: '#/components/responses/ValidationError'
    *       403:
    *         $ref: '#/components/responses/Forbidden'
    *       404:
    *         $ref: '#/components/responses/NotFound'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   updateLanguage = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { id } = req.params as { id: string };
      const { name, code } = req.body as { name: string; code: string };
      const updated = await this.languageService.updateLanguage(id, name, code);
      ResponseHandler.success(res, updated, MessageHandler.getSuccessMessage('languages.updated'));
   });

   /**
    * @swagger
    * /api/v1/languages/{id}:
    *   delete:
    *     summary: Delete a language by ID
    *     description: Requires GLOBAL_ADMIN role
    *     tags: [Languages]
    *     security:
    *       - bearerAuth: []
    *     parameters:
    *       - name: id
    *         in: path
    *         required: true
    *         schema:
    *           type: string
    *     responses:
    *       200:
    *         description: Language deleted successfully
    *       400:
    *         $ref: '#/components/responses/ValidationError'
    *       403:
    *         $ref: '#/components/responses/Forbidden'
    *       404:
    *         $ref: '#/components/responses/NotFound'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   deleteLanguage = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { id } = req.params as { id: string };
      await this.languageService.deleteLanguage(id);
      ResponseHandler.success(res, { deleted: true }, MessageHandler.getSuccessMessage('languages.deleted'));
   });
}
