/**
 * Bookmark Controller
 * Handles HTTP requests and responses for bookmark and note functionality
 */
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { BookmarkService } from '../services/BookmarkService';
import { ResponseHandler } from '../utils/ResponseHandler';
import {
   CreateBookmarkRequest,
   CreateNoteRequest,
   UpdateNoteRequest,
   BookmarkNoteQueryParams,
   BookmarkQueryParams,
} from '../models/BookmarkNoteDto';
import { ErrorHandler } from '../middleware/ErrorHandler';
import { MessageHandler } from '../utils/MessageHandler';
import { resolveUserId } from '../utils/resolveUserId';

export class BookmarkController {
   private bookmarkService: BookmarkService;

   constructor(prisma: PrismaClient) {
      this.bookmarkService = new BookmarkService(prisma);
   }

   /**
    * @swagger
    * /api/v1/bookmarks:
    *   post:
    *     summary: Create a chapter bookmark
    *     description: Save a chapter as a bookmark for the authenticated user
    *     tags: [Bookmarks]
    *     requestBody:
    *       required: true
    *       content:
    *         application/json:
    *           schema:
    *             $ref: '#/components/schemas/CreateBookmarkRequest'
    *           examples:
    *             example1:
    *               summary: Bookmark a chapter
    *               value:
    *                 chapterId: "chapter-123"
    *     responses:
    *       201:
    *         description: Bookmark created successfully
    *         content:
    *           application/json:
    *             schema:
    *               allOf:
    *                 - $ref: '#/components/schemas/ApiResponse'
    *                 - type: object
    *                   properties:
    *                     data:
    *                       $ref: '#/components/schemas/Bookmark'
    *       400:
    *         $ref: '#/components/responses/ValidationError'
    *       404:
    *         $ref: '#/components/responses/NotFound'
    *       409:
    *         description: Chapter already bookmarked
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   createBookmark = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const userId = resolveUserId(req);
      const bookmarkData: CreateBookmarkRequest = req.body;

      const bookmark = await this.bookmarkService.createBookmark(userId, bookmarkData);

      ResponseHandler.success(res, bookmark, MessageHandler.getSuccessMessage('bookmarks.created'), 201);
   });

   /**
    * @swagger
    * /api/v1/bookmarks:
    *   get:
    *     summary: Get user bookmarks
    *     description: Retrieve all bookmarks for the authenticated user with optional filtering
    *     tags: [Bookmarks]
    *     parameters:
    *       - $ref: '#/components/parameters/PageParam'
    *       - $ref: '#/components/parameters/LimitParam'
    *       - name: audiobookId
    *         in: query
    *         schema:
    *           type: string
    *         description: Filter by audiobook ID
    *       - name: chapterId
    *         in: query
    *         schema:
    *           type: string
    *         description: Filter by chapter ID
    *       - name: sortBy
    *         in: query
    *         schema:
    *           type: string
    *           enum: [createdAt, updatedAt]
    *           default: createdAt
    *         description: Field to sort by
    *       - name: sortOrder
    *         in: query
    *         schema:
    *           type: string
    *           enum: [asc, desc]
    *           default: desc
    *         description: Sort order
    *     responses:
    *       200:
    *         $ref: '#/components/responses/PaginatedSuccess'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   getBookmarks = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const userId = resolveUserId(req);
      const sortByParam = req.query['sortBy'] as string | undefined;
      const queryParams: BookmarkQueryParams = {
         audiobookId: req.query['audiobookId'] as string,
         chapterId: req.query['chapterId'] as string,
         page: req.query['page'] ? parseInt(req.query['page'] as string, 10) : 1,
         limit: req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 20,
         sortBy: sortByParam === 'updatedAt' ? 'updatedAt' : 'createdAt',
         sortOrder: (req.query['sortOrder'] as 'asc' | 'desc') || 'desc',
      };

      const { bookmarks, totalCount } = await this.bookmarkService.getBookmarks(userId, queryParams);

      const pagination = ResponseHandler.calculatePagination(
         queryParams.page!,
         queryParams.limit!,
         totalCount
      );

      ResponseHandler.paginated(res, bookmarks, pagination, MessageHandler.getSuccessMessage('bookmarks.retrieved'));
   });

   /**
    * @swagger
    * /api/v1/bookmarks/{id}:
    *   get:
    *     summary: Get bookmark by ID
    *     description: Retrieve a specific bookmark by its unique identifier
    *     tags: [Bookmarks]
    *     parameters:
    *       - name: id
    *         in: path
    *         required: true
    *         schema:
    *           type: string
    *         description: Bookmark ID
    *     responses:
    *       200:
    *         description: Bookmark retrieved successfully
    *         content:
    *           application/json:
    *             schema:
    *               allOf:
    *                 - $ref: '#/components/schemas/ApiResponse'
    *                 - type: object
    *                   properties:
    *                     data:
    *                       $ref: '#/components/schemas/Bookmark'
    *       404:
    *         $ref: '#/components/responses/NotFound'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   getBookmarkById = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { id } = req.params;
      const userId = resolveUserId(req);

      const bookmark = await this.bookmarkService.getBookmarkById(userId, id as string);

      ResponseHandler.success(res, bookmark, MessageHandler.getSuccessMessage('bookmarks.retrieved_by_id'));
   });

   /**
    * @swagger
    * /api/v1/bookmarks/{id}:
    *   delete:
    *     summary: Delete a bookmark
    *     description: Delete a bookmark by its unique identifier
    *     tags: [Bookmarks]
    *     parameters:
    *       - name: id
    *         in: path
    *         required: true
    *         schema:
    *           type: string
    *         description: Bookmark ID
    *     responses:
    *       204:
    *         $ref: '#/components/responses/NoContent'
    *       404:
    *         $ref: '#/components/responses/NotFound'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   deleteBookmark = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { id } = req.params;
      const userId = resolveUserId(req);

      await this.bookmarkService.deleteBookmark(userId, id as string);

      ResponseHandler.noContent(res);
   });

   /**
    * @swagger
    * /api/v1/notes:
    *   post:
    *     summary: Create a new note
    *     description: Create a new note for an audiobook or chapter
    *     tags: [Notes]
    *     requestBody:
    *       required: true
    *       content:
    *         application/json:
    *           schema:
    *             $ref: '#/components/schemas/CreateNoteRequest'
    *           examples:
    *             example1:
    *               summary: Create note
    *               value:
    *                 audiobookId: "123e4567-e89b-12d3-a456-426614174000"
    *                 title: "Character Analysis"
    *                 content: "The protagonist shows great character development in this section"
    *                 position: 1200
    *             example2:
    *               summary: Create chapter note
    *               value:
    *                 chapterId: "chapter-123"
    *                 content: "This chapter reveals important plot details"
    *     responses:
    *       201:
    *         description: Note created successfully
    *         content:
    *           application/json:
    *             schema:
    *               allOf:
    *                 - $ref: '#/components/schemas/ApiResponse'
    *                 - type: object
    *                   properties:
    *                     data:
    *                       $ref: '#/components/schemas/Note'
    *       400:
    *         $ref: '#/components/responses/ValidationError'
    *       404:
    *         $ref: '#/components/responses/NotFound'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   createNote = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const noteData: CreateNoteRequest = req.body;
      const userId = (req as any).user.id; // Assuming user is attached by auth middleware

      const note = await this.bookmarkService.createNote(userId, noteData);

      ResponseHandler.success(res, note, MessageHandler.getSuccessMessage('notes.created'), 201);
   });

   /**
    * @swagger
    * /api/v1/notes:
    *   get:
    *     summary: Get user notes
    *     description: Retrieve all notes for the authenticated user with optional filtering
    *     tags: [Notes]
    *     parameters:
    *       - $ref: '#/components/parameters/PageParam'
    *       - $ref: '#/components/parameters/LimitParam'
    *       - name: audiobookId
    *         in: query
    *         schema:
    *           type: string
    *         description: Filter by audiobook ID
    *       - name: chapterId
    *         in: query
    *         schema:
    *           type: string
    *         description: Filter by chapter ID
    *       - name: search
    *         in: query
    *         schema:
    *           type: string
    *         description: Search in title and content
    *       - name: sortBy
    *         in: query
    *         schema:
    *           type: string
    *           enum: [createdAt, updatedAt, position, title]
    *           default: createdAt
    *         description: Field to sort by
    *       - name: sortOrder
    *         in: query
    *         schema:
    *           type: string
    *           enum: [asc, desc]
    *           default: desc
    *         description: Sort order
    *     responses:
    *       200:
    *         $ref: '#/components/responses/PaginatedSuccess'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   getNotes = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const queryParams: BookmarkNoteQueryParams = {
         audiobookId: req.query['audiobookId'] as string,
         chapterId: req.query['chapterId'] as string,
         page: req.query['page'] ? parseInt(req.query['page'] as string, 10) : 1,
         limit: req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 20,
         sortBy: (req.query['sortBy'] as BookmarkNoteQueryParams['sortBy']) || 'createdAt',
         sortOrder: (req.query['sortOrder'] as 'asc' | 'desc') || 'desc',
         search: req.query['search'] as string,
      };

      const { notes, totalCount } = await this.bookmarkService.getNotes((req as any).user.id, queryParams);

      const pagination = ResponseHandler.calculatePagination(
         queryParams.page!,
         queryParams.limit!,
         totalCount
      );

      ResponseHandler.paginated(res, notes, pagination, MessageHandler.getSuccessMessage('notes.retrieved'));
   });

   /**
    * @swagger
    * /api/v1/notes/{id}:
    *   get:
    *     summary: Get note by ID
    *     description: Retrieve a specific note by its unique identifier
    *     tags: [Notes]
    *     parameters:
    *       - name: id
    *         in: path
    *         required: true
    *         schema:
    *           type: string
    *         description: Note ID
    *     responses:
    *       200:
    *         description: Note retrieved successfully
    *         content:
    *           application/json:
    *             schema:
    *               allOf:
    *                 - $ref: '#/components/schemas/ApiResponse'
    *                 - type: object
    *                   properties:
    *                     data:
    *                       $ref: '#/components/schemas/Note'
    *       404:
    *         $ref: '#/components/responses/NotFound'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   getNoteById = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { id } = req.params;
      const userId = (req as any).user.id; // Assuming user is attached by auth middleware

      const note = await this.bookmarkService.getNoteById(userId, id as string);

      ResponseHandler.success(res, note, MessageHandler.getSuccessMessage('notes.retrieved_by_id'));
   });

   /**
    * @swagger
    * /api/v1/notes/{id}:
    *   put:
    *     summary: Update a note
    *     description: Update an existing note with the provided information
    *     tags: [Notes]
    *     parameters:
    *       - name: id
    *         in: path
    *         required: true
    *         schema:
    *           type: string
    *         description: Note ID
    *     requestBody:
    *       required: true
    *       content:
    *         application/json:
    *           schema:
    *             $ref: '#/components/schemas/UpdateNoteRequest'
    *           examples:
    *             example1:
    *               summary: Update note
    *               value:
    *                 title: "Updated Character Analysis"
    *                 content: "Updated analysis of character development"
    *                 position: 1300
    *     responses:
    *       200:
    *         description: Note updated successfully
    *         content:
    *           application/json:
    *             schema:
    *               allOf:
    *                 - $ref: '#/components/schemas/ApiResponse'
    *                 - type: object
    *                   properties:
    *                     data:
    *                       $ref: '#/components/schemas/Note'
    *       400:
    *         $ref: '#/components/responses/ValidationError'
    *       404:
    *         $ref: '#/components/responses/NotFound'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   updateNote = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { id } = req.params;
      const updateData: UpdateNoteRequest = req.body;
      const userId = (req as any).user.id; // Assuming user is attached by auth middleware

      const note = await this.bookmarkService.updateNote(userId, id as string, updateData);

      ResponseHandler.success(res, note, MessageHandler.getSuccessMessage('notes.updated'));
   });

   /**
    * @swagger
    * /api/v1/notes/{id}:
    *   delete:
    *     summary: Delete a note
    *     description: Delete a note by its unique identifier
    *     tags: [Notes]
    *     parameters:
    *       - name: id
    *         in: path
    *         required: true
    *         schema:
    *           type: string
    *         description: Note ID
    *     responses:
    *       204:
    *         $ref: '#/components/responses/NoContent'
    *       404:
    *         $ref: '#/components/responses/NotFound'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   deleteNote = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { id } = req.params;
      const userId = (req as any).user.id; // Assuming user is attached by auth middleware

      await this.bookmarkService.deleteNote(userId, id as string);

      ResponseHandler.noContent(res);
   });

   /**
    * @swagger
    * /api/v1/bookmarks-notes:
    *   get:
    *     summary: Get combined bookmarks and notes
    *     description: Retrieve both bookmarks and notes for the authenticated user
    *     tags: [Bookmarks, Notes]
    *     parameters:
    *       - $ref: '#/components/parameters/PageParam'
    *       - $ref: '#/components/parameters/LimitParam'
    *       - name: audiobookId
    *         in: query
    *         schema:
    *           type: string
    *         description: Filter by audiobook ID
    *       - name: chapterId
    *         in: query
    *         schema:
    *           type: string
    *         description: Filter by chapter ID
    *       - name: search
    *         in: query
    *         schema:
    *           type: string
    *         description: Search in titles and content
    *     responses:
    *       200:
    *         description: Bookmarks and notes retrieved successfully
    *         content:
    *           application/json:
    *             schema:
    *               allOf:
    *                 - $ref: '#/components/schemas/ApiResponse'
    *                 - type: object
    *                   properties:
    *                     data:
    *                       $ref: '#/components/schemas/BookmarkNoteResponse'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   getBookmarksAndNotes = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const queryParams: BookmarkNoteQueryParams = {
         audiobookId: req.query['audiobookId'] as string,
         chapterId: req.query['chapterId'] as string,
         page: req.query['page'] ? parseInt(req.query['page'] as string, 10) : 1,
         limit: req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 20,
         search: req.query['search'] as string,
      };

      const result = await this.bookmarkService.getBookmarksAndNotes((req as any).user.id, queryParams);

      ResponseHandler.success(res, result, MessageHandler.getSuccessMessage('bookmarks_notes.retrieved'));
   });

   /**
    * @swagger
    * /api/v1/bookmarks-notes/stats:
    *   get:
    *     summary: Get bookmark and note statistics
    *     description: Retrieve statistics about user's bookmarks and notes
    *     tags: [Bookmarks, Notes]
    *     responses:
    *       200:
    *         description: Statistics retrieved successfully
    *         content:
    *           application/json:
    *             schema:
    *               allOf:
    *                 - $ref: '#/components/schemas/ApiResponse'
    *                 - type: object
    *                   properties:
    *                     data:
    *                       $ref: '#/components/schemas/BookmarkNoteStats'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   getBookmarkNoteStats = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const userId = (req as any).user.id; // Assuming user is attached by auth middleware

      const stats = await this.bookmarkService.getBookmarkNoteStats(userId);

      ResponseHandler.success(res, stats, MessageHandler.getSuccessMessage('bookmarks_notes.stats_retrieved'));
   });
}
