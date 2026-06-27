/**
 * Mood Controller
 * Handles HTTP requests and responses for mood operations
 */
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { MoodService } from '../services/MoodService';
import { ResponseHandler } from '../utils/ResponseHandler';
import { ErrorHandler } from '../middleware/ErrorHandler';
import { MessageHandler } from '../utils/MessageHandler';
import { CreateMoodDto, UpdateMoodDto } from '../models/MoodDto';
import { isGuestRequest } from '../utils/guestCatalogDefaults';

function getBearerToken(req: Request): string | undefined {
   const authHeader = req.headers.authorization;
   if (!authHeader?.startsWith('Bearer ')) {
      return undefined;
   }
   return authHeader.slice(7).trim();
}

export class MoodController {
   private moodService: MoodService;

   constructor(prisma: PrismaClient) {
      this.moodService = new MoodService(prisma);
   }

   /**
    * @swagger
    * /api/v1/moods:
    *   post:
    *     summary: Create a new mood
    *     tags: [Moods]
    *     requestBody:
    *       required: true
    *       content:
    *         application/json:
    *           schema:
    *             type: object
    *             required: [name, hexcode, icon, descriptionIcon]
    *             properties:
    *               name:
    *                 type: string
    *               description:
    *                 type: string
    *               descriptionIcon:
    *                 type: string
    *                 example: "text"
    *               hexcode:
    *                 type: string
    *                 example: "#FF5733"
    *               icon:
    *                 type: string
    *                 example: "sun"
    *               attributes:
    *                 type: array
    *                 items:
    *                   type: object
    *                   required: [icon, description]
    *                   properties:
    *                     icon:
    *                       type: string
    *                     description:
    *                       type: string
    *     responses:
    *       201:
    *         description: Mood created successfully
    *       400:
    *         $ref: '#/components/responses/ValidationError'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   createMood = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const createMoodDto = req.body as CreateMoodDto;
      const created = await this.moodService.createMood(createMoodDto);
      ResponseHandler.success(res, created, MessageHandler.getSuccessMessage('moods.created'), 201);
   });

   /**
    * @swagger
    * /api/v1/moods:
    *   get:
    *     summary: Get all moods
    *     tags: [Moods]
    *     responses:
    *       200:
    *         description: Moods retrieved successfully
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   getAllMoods = ErrorHandler.asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      const moods = await this.moodService.getAllMoods();
      ResponseHandler.success(res, moods, MessageHandler.getSuccessMessage('moods.retrieved'));
   });

   /**
    * @swagger
    * /api/v1/moods/{id}:
    *   get:
    *     summary: Get a mood by ID
    *     tags: [Moods]
    *     parameters:
    *       - name: id
    *         in: path
    *         required: true
    *         schema:
    *           type: string
    *     responses:
    *       200:
    *         description: Mood retrieved successfully (includes purpose, attributes, and associated audiobooks)
    *       404:
    *         $ref: '#/components/responses/NotFound'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   getMoodById = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { id } = req.params as { id: string };
      const mood = await this.moodService.getMoodById(id, getBearerToken(req), isGuestRequest(req));
      ResponseHandler.success(res, mood, MessageHandler.getSuccessMessage('moods.retrieved'));
   });

   /**
    * @swagger
    * /api/v1/moods/{id}:
    *   put:
    *     summary: Update a mood by ID
    *     tags: [Moods]
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
    *             properties:
    *               name:
    *                 type: string
    *               description:
    *                 type: string
    *               descriptionIcon:
    *                 type: string
    *                 example: "text"
    *               hexcode:
    *                 type: string
    *                 example: "#FF5733"
    *               icon:
    *                 type: string
    *                 example: "sun"
    *               attributes:
    *                 type: array
    *                 items:
    *                   type: object
    *                   required: [icon, description]
    *                   properties:
    *                     icon:
    *                       type: string
    *                     description:
    *                       type: string
    *     responses:
    *       200:
    *         description: Mood updated successfully
    *       400:
    *         $ref: '#/components/responses/ValidationError'
    *       404:
    *         $ref: '#/components/responses/NotFound'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   updateMood = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { id } = req.params as { id: string };
      const updateMoodDto = req.body as UpdateMoodDto;
      const updated = await this.moodService.updateMood(id, updateMoodDto);
      ResponseHandler.success(res, updated, MessageHandler.getSuccessMessage('moods.updated'));
   });

   /**
    * @swagger
    * /api/v1/moods/{id}:
    *   delete:
    *     summary: Delete a mood by ID
    *     tags: [Moods]
    *     parameters:
    *       - name: id
    *         in: path
    *         required: true
    *         schema:
    *           type: string
    *     responses:
    *       200:
    *         description: Mood deleted successfully
    *       404:
    *         $ref: '#/components/responses/NotFound'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   deleteMood = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { id } = req.params as { id: string };
      await this.moodService.deleteMood(id);
      ResponseHandler.success(res, { deleted: true }, MessageHandler.getSuccessMessage('moods.deleted'));
   });
}
