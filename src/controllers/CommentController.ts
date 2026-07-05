/**
 * Comment Controller
 */
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { CommentService } from '../services/CommentService';
import { ResponseHandler } from '../utils/ResponseHandler';
import { ErrorHandler } from '../middleware/ErrorHandler';
import { MessageHandler } from '../utils/MessageHandler';
import {
   CommentQueryParams,
   CreateCommentRequest,
   UpdateCommentRequest,
} from '../models/CommentDto';
import { resolveUserId } from '../utils/resolveUserId';

function getBearerToken(req: Request): string | undefined {
   const authorization = req.headers.authorization;
   if (!authorization || !authorization.startsWith('Bearer ')) {
      return undefined;
   }
   const token = authorization.slice(7).trim();
   return token.length > 0 ? token : undefined;
}

export class CommentController {
   private commentService: CommentService;

   constructor(prisma: PrismaClient) {
      this.commentService = new CommentService(prisma);
   }

   /**
    * @swagger
    * /api/v1/comments:
    *   post:
    *     summary: Create a comment or reply
    *     tags: [Comments]
    *     requestBody:
    *       required: true
    *       content:
    *         application/json:
    *           schema:
    *             $ref: '#/components/schemas/CreateCommentRequest'
    *     responses:
    *       201:
    *         description: Comment created successfully
    *       400:
    *         $ref: '#/components/responses/ValidationError'
    *       404:
    *         $ref: '#/components/responses/NotFound'
    */
   createComment = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const userId = resolveUserId(req);
      const data: CreateCommentRequest = req.body;
      const comment = await this.commentService.createComment(userId, data, getBearerToken(req));
      ResponseHandler.success(res, comment, MessageHandler.getSuccessMessage('comments.created'), 201);
   });

   /**
    * @swagger
    * /api/v1/comments:
    *   get:
    *     summary: List comments
    *     tags: [Comments]
    *     parameters:
    *       - $ref: '#/components/parameters/PageParam'
    *       - $ref: '#/components/parameters/LimitParam'
    *       - name: audiobookId
    *         in: query
    *         schema:
    *           type: string
    *       - name: parentId
    *         in: query
    *         schema:
    *           type: string
    *         description: Filter by parent comment ID; use "null" for top-level only
    *     responses:
    *       200:
    *         description: Comments retrieved successfully
    */
   getComments = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const page = req.query['page'] ? parseInt(req.query['page'] as string, 10) : 1;
      const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 20;
      const query: CommentQueryParams = {
         audiobookId: req.query['audiobookId'] as string,
         parentId: req.query['parentId'] as string,
         page,
         limit,
         sortBy: (req.query['sortBy'] as CommentQueryParams['sortBy']) || 'createdAt',
         sortOrder: (req.query['sortOrder'] as CommentQueryParams['sortOrder']) || 'desc',
      };
      const result = await this.commentService.getComments(query, getBearerToken(req));
      const pagination = ResponseHandler.calculatePagination(page, limit, result.totalCount);
      ResponseHandler.paginated(
         res,
         result.comments,
         pagination,
         MessageHandler.getSuccessMessage('comments.retrieved')
      );
   });

   /**
    * @swagger
    * /api/v1/comments/{id}:
    *   get:
    *     summary: Get a comment by ID
    *     tags: [Comments]
    *     parameters:
    *       - name: id
    *         in: path
    *         required: true
    *         schema:
    *           type: string
    *     responses:
    *       200:
    *         description: Comment retrieved successfully
    *       404:
    *         $ref: '#/components/responses/NotFound'
    */
   getCommentById = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { id } = req.params as { id: string };
      const comment = await this.commentService.getCommentById(id, getBearerToken(req));
      ResponseHandler.success(res, comment, MessageHandler.getSuccessMessage('comments.retrieved_by_id'));
   });

   /**
    * @swagger
    * /api/v1/comments/{id}:
    *   put:
    *     summary: Update own comment
    *     tags: [Comments]
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
    *             $ref: '#/components/schemas/UpdateCommentRequest'
    *     responses:
    *       200:
    *         description: Comment updated successfully
    *       403:
    *         $ref: '#/components/responses/Forbidden'
    *       404:
    *         $ref: '#/components/responses/NotFound'
    */
   updateComment = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const userId = resolveUserId(req);
      const { id } = req.params as { id: string };
      const data: UpdateCommentRequest = req.body;
      const comment = await this.commentService.updateComment(id, userId, data, getBearerToken(req));
      ResponseHandler.success(res, comment, MessageHandler.getSuccessMessage('comments.updated'));
   });

   /**
    * @swagger
    * /api/v1/comments/{id}:
    *   delete:
    *     summary: Delete own comment
    *     tags: [Comments]
    *     parameters:
    *       - name: id
    *         in: path
    *         required: true
    *         schema:
    *           type: string
    *     responses:
    *       200:
    *         description: Comment deleted successfully
    *       403:
    *         $ref: '#/components/responses/Forbidden'
    *       404:
    *         $ref: '#/components/responses/NotFound'
    */
   deleteComment = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const userId = resolveUserId(req);
      const { id } = req.params as { id: string };
      await this.commentService.deleteComment(id, userId);
      ResponseHandler.success(res, null, MessageHandler.getSuccessMessage('comments.deleted'));
   });
}
