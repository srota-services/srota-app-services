/**
 * Playlist Controller
 */
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { PlaylistService } from '../services/PlaylistService';
import { ResponseHandler } from '../utils/ResponseHandler';
import { ErrorHandler } from '../middleware/ErrorHandler';
import { MessageHandler } from '../utils/MessageHandler';
import {
   CreatePlaylistItemRequest,
   CreatePlaylistRequest,
   PlaylistQueryParams,
   UpdatePlaylistItemRequest,
   UpdatePlaylistRequest,
} from '../models/PlaylistDto';
import { resolveUserId } from '../utils/resolveUserId';

export class PlaylistController {
   private playlistService: PlaylistService;

   constructor(prisma: PrismaClient) {
      this.playlistService = new PlaylistService(prisma);
   }

   /**
    * @swagger
    * /api/v1/playlists:
    *   post:
    *     summary: Create a playlist
    *     tags: [Playlists]
    *     requestBody:
    *       required: true
    *       content:
    *         application/json:
    *           schema:
    *             $ref: '#/components/schemas/CreatePlaylistRequest'
    *     responses:
    *       201:
    *         description: Playlist created successfully
    */
   createPlaylist = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const userId = resolveUserId(req);
      const data: CreatePlaylistRequest = req.body;
      const playlist = await this.playlistService.createPlaylist(userId, data);
      ResponseHandler.success(res, playlist, MessageHandler.getSuccessMessage('playlists.created'), 201);
   });

   /**
    * @swagger
    * /api/v1/playlists:
    *   get:
    *     summary: List current user's playlists
    *     tags: [Playlists]
    *     parameters:
    *       - $ref: '#/components/parameters/PageParam'
    *       - $ref: '#/components/parameters/LimitParam'
    *       - name: isPublic
    *         in: query
    *         schema:
    *           type: boolean
    *         description: Optional filter for the authenticated user's public or private playlists
    *     responses:
    *       200:
    *         description: Playlists retrieved successfully
    */
   getPlaylists = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const userId = resolveUserId(req);
      const isPublicParam = req.query['isPublic'];
      const page = req.query['page'] ? parseInt(req.query['page'] as string, 10) : 1;
      const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 20;
      const query: PlaylistQueryParams = {
         page,
         limit,
         sortBy: (req.query['sortBy'] as PlaylistQueryParams['sortBy']) || 'createdAt',
         sortOrder: (req.query['sortOrder'] as PlaylistQueryParams['sortOrder']) || 'desc',
      };
      if (isPublicParam === 'true') {
         query.isPublic = true;
      } else if (isPublicParam === 'false') {
         query.isPublic = false;
      }
      const result = await this.playlistService.getPlaylists(userId, query);
      const pagination = ResponseHandler.calculatePagination(page, limit, result.totalCount);
      ResponseHandler.paginated(
         res,
         result.playlists,
         pagination,
         MessageHandler.getSuccessMessage('playlists.retrieved')
      );
   });

   /**
    * @swagger
    * /api/v1/playlists/{id}:
    *   get:
    *     summary: Get own playlist by ID
    *     tags: [Playlists]
    *     parameters:
    *       - name: id
    *         in: path
    *         required: true
    *         schema:
    *           type: string
    *     responses:
    *       200:
    *         description: Playlist retrieved successfully
    *       403:
    *         $ref: '#/components/responses/Forbidden'
    *       404:
    *         $ref: '#/components/responses/NotFound'
    */
   getPlaylistById = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const userId = resolveUserId(req);
      const { id } = req.params as { id: string };
      const playlist = await this.playlistService.getPlaylistById(id, userId);
      ResponseHandler.success(res, playlist, MessageHandler.getSuccessMessage('playlists.retrieved_by_id'));
   });

   /**
    * @swagger
    * /api/v1/playlists/{id}:
    *   put:
    *     summary: Update own playlist
    *     tags: [Playlists]
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
    *             $ref: '#/components/schemas/UpdatePlaylistRequest'
    *     responses:
    *       200:
    *         description: Playlist updated successfully
    */
   updatePlaylist = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const userId = resolveUserId(req);
      const { id } = req.params as { id: string };
      const data: UpdatePlaylistRequest = req.body;
      const playlist = await this.playlistService.updatePlaylist(id, userId, data);
      ResponseHandler.success(res, playlist, MessageHandler.getSuccessMessage('playlists.updated'));
   });

   /**
    * @swagger
    * /api/v1/playlists/{id}:
    *   delete:
    *     summary: Delete own playlist
    *     tags: [Playlists]
    *     parameters:
    *       - name: id
    *         in: path
    *         required: true
    *         schema:
    *           type: string
    *     responses:
    *       200:
    *         description: Playlist deleted successfully
    */
   deletePlaylist = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const userId = resolveUserId(req);
      const { id } = req.params as { id: string };
      await this.playlistService.deletePlaylist(id, userId);
      ResponseHandler.success(res, null, MessageHandler.getSuccessMessage('playlists.deleted'));
   });

   /**
    * @swagger
    * /api/v1/playlists/{id}/items:
    *   post:
    *     summary: Add an audiobook to a playlist
    *     tags: [Playlists]
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
    *             $ref: '#/components/schemas/CreatePlaylistItemRequest'
    *     responses:
    *       201:
    *         description: Playlist item created successfully
    */
   addPlaylistItem = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const userId = resolveUserId(req);
      const { id } = req.params as { id: string };
      const data: CreatePlaylistItemRequest = req.body;
      const item = await this.playlistService.addPlaylistItem(id, userId, data);
      ResponseHandler.success(res, item, MessageHandler.getSuccessMessage('playlist_items.created'), 201);
   });

   /**
    * @swagger
    * /api/v1/playlists/{id}/items:
    *   get:
    *     summary: List playlist items
    *     tags: [Playlists]
    *     parameters:
    *       - name: id
    *         in: path
    *         required: true
    *         schema:
    *           type: string
    *     responses:
    *       200:
    *         description: Playlist items retrieved successfully
    */
   getPlaylistItems = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const userId = resolveUserId(req);
      const { id } = req.params as { id: string };
      const items = await this.playlistService.getPlaylistItems(id, userId);
      ResponseHandler.success(res, items, MessageHandler.getSuccessMessage('playlist_items.retrieved'));
   });

   /**
    * @swagger
    * /api/v1/playlists/{id}/items/{itemId}:
    *   put:
    *     summary: Reorder a playlist item
    *     tags: [Playlists]
    *     parameters:
    *       - name: id
    *         in: path
    *         required: true
    *         schema:
    *           type: string
    *       - name: itemId
    *         in: path
    *         required: true
    *         schema:
    *           type: string
    *     requestBody:
    *       required: true
    *       content:
    *         application/json:
    *           schema:
    *             $ref: '#/components/schemas/UpdatePlaylistItemRequest'
    *     responses:
    *       200:
    *         description: Playlist item updated successfully
    */
   updatePlaylistItem = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const userId = resolveUserId(req);
      const { id, itemId } = req.params as { id: string; itemId: string };
      const data: UpdatePlaylistItemRequest = req.body;
      const item = await this.playlistService.updatePlaylistItem(id, itemId, userId, data);
      ResponseHandler.success(res, item, MessageHandler.getSuccessMessage('playlist_items.updated'));
   });

   /**
    * @swagger
    * /api/v1/playlists/{id}/items/{itemId}:
    *   delete:
    *     summary: Remove an audiobook from a playlist
    *     tags: [Playlists]
    *     parameters:
    *       - name: id
    *         in: path
    *         required: true
    *         schema:
    *           type: string
    *       - name: itemId
    *         in: path
    *         required: true
    *         schema:
    *           type: string
    *     responses:
    *       200:
    *         description: Playlist item deleted successfully
    */
   deletePlaylistItem = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const userId = resolveUserId(req);
      const { id, itemId } = req.params as { id: string; itemId: string };
      await this.playlistService.deletePlaylistItem(id, itemId, userId);
      ResponseHandler.success(res, null, MessageHandler.getSuccessMessage('playlist_items.deleted'));
   });
}
