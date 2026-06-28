/**
 * Genre Routes
 * Handles genre-related HTTP endpoints
 */
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { GenreController } from '../controllers/GenreController';
import { ValidationMiddleware } from '../middleware/ValidationMiddleware';
import { requireGlobalAdmin } from '../middleware/RoleMiddleware';

export function createGenreRoutes(prisma: PrismaClient): Router {
   const router = Router();
   const genreController = new GenreController(prisma);

   /**
    * @swagger
    * /api/v1/genres:
    *   get:
    *     summary: Get all available genres
    *     description: Retrieve a list of all available genres in the system. Guest users may browse via GET; write operations require registration.
    *     tags: [Genres]
    *     responses:
    *       200:
    *         description: Genres retrieved successfully
    *         content:
    *           application/json:
    *             schema:
    *               allOf:
    *                 - $ref: '#/components/schemas/ApiResponse'
    *                 - type: object
    *                   properties:
    *                     data:
    *                       type: array
    *                       items:
    *                         $ref: '#/components/schemas/Genre'
    *             examples:
    *               success:
    *                 summary: Successful response
    *                 value:
    *                   success: true
    *                   message: "Genres retrieved successfully"
    *                   data:
    *                     - id: "123e4567-e89b-12d3-a456-426614174000"
    *                       name: "Fiction"
    *                       createdAt: "2024-01-15T10:30:00Z"
    *                       updatedAt: "2024-01-15T10:30:00Z"
    *                     - id: "123e4567-e89b-12d3-a456-426614174001"
    *                       name: "Non-Fiction"
    *                       createdAt: "2024-01-15T10:30:00Z"
    *                       updatedAt: "2024-01-15T10:30:00Z"
    *                     - id: "123e4567-e89b-12d3-a456-426614174002"
    *                       name: "Mystery"
    *                       createdAt: "2024-01-15T10:30:00Z"
    *                       updatedAt: "2024-01-15T10:30:00Z"
    *                   timestamp: "2024-01-15T10:30:00Z"
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   router.get('/', genreController.getAllGenres);

   // Simple inline validator for genre body
   const validateGenreBody = (req: any, res: any, next: any) => {
      const { name } = req.body || {};
      if (typeof name !== 'string') {
         return res.status(400).json({ success: false, message: 'Invalid name' });
      }
      const trimmed = name.trim();
      if (trimmed.length === 0 || trimmed.length > 100) {
         return res.status(400).json({ success: false, message: 'Invalid name' });
      }
      req.body.name = trimmed;
      next();
   };

   // Create genre
   router.post('/', requireGlobalAdmin(), validateGenreBody, genreController.createGenre);

   // Get genre by id
   router.get('/:id', ValidationMiddleware.validateId, genreController.getGenreById);

   // Update genre
   router.put('/:id', requireGlobalAdmin(), ValidationMiddleware.validateId, validateGenreBody, genreController.updateGenre);

   // Delete genre
   router.delete('/:id', requireGlobalAdmin(), ValidationMiddleware.validateId, genreController.deleteGenre);

   return router;
}
