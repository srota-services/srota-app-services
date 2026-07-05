/**
 * Streaming Routes
 * Defines HTTP routes for audio streaming endpoints that proxy to external streaming service
 */
import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import axios, { AxiosResponse } from 'axios';
import { config } from '../config/env';
import { ResponseHandler } from '../utils/ResponseHandler';
import { MessageHandler } from '../utils/MessageHandler';
import { requireChapterStreamAccess } from '../middleware/StreamAccessMiddleware';

export function createStreamingRoutes(prisma: PrismaClient): Router {
   const router = Router();
   const chapterStreamAccess = requireChapterStreamAccess(prisma);

   const resolveProxyAuth = (req: Request): { authHeader?: string; userId?: string } => {
      const authHeader = req.headers.authorization;
      if (authHeader) {
         return { authHeader };
      }

      const accessToken = req.query['access_token'];
      if (typeof accessToken === 'string' && accessToken.trim().length > 0) {
         return { authHeader: `Bearer ${accessToken.trim()}` };
      }

      const userId = req.query['user'] as string;
      if (userId) {
         return { userId };
      }

      return {};
   };

   const validateStreamingParams = (req: Request, res: Response, next: NextFunction): void => {
      const { chapterId, bitrate, segmentId } = req.params;

      // Validate chapterId (required for all routes)
      if (!chapterId || chapterId.trim() === '') {
         ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.chapter_id_required'));
         return;
      }

      // Validate bitrate (required for playlist and segment routes)
      if (req.path.includes('/playlist.m3u8') || req.path.includes('/segments/')) {
         if (!bitrate || bitrate.trim() === '') {
            ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.bitrate_required'));
            return;
         }
      }

      // Validate segmentId (required for segment routes)
      if (req.path.includes('/segments/')) {
         if (!segmentId || segmentId.trim() === '') {
            ResponseHandler.validationError(res, MessageHandler.getErrorMessage('validation.segment_id_required'));
            return;
         }
      }

      next();
   };

   const proxyStreamToStreamingService = async (req: Request, res: Response): Promise<void> => {
      try {
         const { authHeader, userId } = resolveProxyAuth(req);
         if (!authHeader && !userId) {
            ResponseHandler.unauthorized(res, MessageHandler.getErrorMessage('unauthorized.not_authenticated'));
            return;
         }

         const externalUrl = `${config.STREAMING_SERVICE_URL}${req.path}${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`;
         const headers: Record<string, string> = {
            ...(authHeader ? { Authorization: authHeader } : { user_id: userId! }),
         };

         const response = await axios.get(externalUrl, {
            headers,
            responseType: 'stream',
            timeout: 0,
         });

         res.setHeader('Content-Type', 'text/event-stream');
         res.setHeader('Cache-Control', 'no-cache');
         res.setHeader('Connection', 'keep-alive');
         response.data.pipe(res);
      } catch (error) {
         if (axios.isAxiosError(error) && error.response) {
            res.status(error.response.status).send(error.response.data);
         } else {
            ResponseHandler.internalError(res, MessageHandler.getErrorMessage('internal.streaming_service_unavailable'));
         }
      }
   };

   const proxyPostToStreamingService = async (req: Request, res: Response): Promise<void> => {
      try {
         const { authHeader, userId } = resolveProxyAuth(req);
         if (!authHeader && !userId) {
            ResponseHandler.unauthorized(res, MessageHandler.getErrorMessage('unauthorized.not_authenticated'));
            return;
         }

         const chapterId = req.params['chapterId'] as string;
         const chapter = await prisma.chapter.findUnique({ where: { id: chapterId } });
         if (!chapter?.filePath) {
            ResponseHandler.notFound(res, MessageHandler.getErrorMessage('not_found.chapter'));
            return;
         }

         const externalUrl = `${config.STREAMING_SERVICE_URL}${req.path}`;
         const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(authHeader ? { Authorization: authHeader } : { user_id: userId! }),
         };

         const response = await axios.post(
            externalUrl,
            { ...req.body, inputPath: chapter.filePath },
            { headers, timeout: 30000 }
         );

         Object.keys(response.headers).forEach(key => {
            res.setHeader(key, response.headers[key] as string);
         });
         res.status(response.status).send(response.data);
      } catch (error) {
         if (axios.isAxiosError(error) && error.response) {
            res.status(error.response.status).send(error.response.data);
         } else {
            ResponseHandler.internalError(res, MessageHandler.getErrorMessage('internal.default'));
         }
      }
   };

   /**
    * Proxy handler for streaming requests
    * Forwards authenticated requests to external streaming service
    */
   const proxyToStreamingService = async (req: Request, res: Response): Promise<void> => {
      try {
         const { authHeader, userId } = resolveProxyAuth(req);
         if (!authHeader && !userId) {
            ResponseHandler.unauthorized(res, MessageHandler.getErrorMessage('unauthorized.not_authenticated'));
            return;
         }

         const externalUrl = `${config.STREAMING_SERVICE_URL}${req.path}`;
         const isBinaryResponse = req.path.includes('/segments/');
         const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(authHeader ? { Authorization: authHeader } : { user_id: userId! }),
         };

         const axiosConfig = {
            headers,
            responseType: (isBinaryResponse ? 'arraybuffer' : 'text') as 'arraybuffer' | 'text',
            timeout: 30000,
         };

         const response: AxiosResponse = req.method === 'POST'
            ? await axios.post(externalUrl, req.body, axiosConfig)
            : await axios.get(externalUrl, axiosConfig);

         // Forward response headers
         Object.keys(response.headers).forEach(key => {
            res.setHeader(key, response.headers[key] as string);
         });

         // Set response status and data
         res.status(response.status).send(response.data);

      } catch (error) {
         // console.error('Streaming service proxy error:', error);

         if (axios.isAxiosError(error)) {
            if (error.response) {
               // Forward error response from external service
               res.status(error.response.status).send(error.response.data);
            } else if (error.request) {
               // Network error
               ResponseHandler.internalError(res, MessageHandler.getErrorMessage('internal.streaming_service_unavailable'));
            } else {
               // Other error
               ResponseHandler.internalError(res, MessageHandler.getErrorMessage('internal.default'));
            }
         } else {
            ResponseHandler.internalError(res, MessageHandler.getErrorMessage('internal.default'));
         }
      }
   };

   /**
    * @swagger
    * /api/v1/stream/chapters/{chapterId}/master.m3u8:
    *   get:
    *     summary: Get master playlist for chapter
    *     description: |
    *       Proxied to streaming-service. Retrieve the master HLS playlist for a specific chapter.
    *       Authentication: provide **either** Bearer token **or** `user` query param (one is required).
    *     tags: [Streaming]
    *     security:
    *       - bearerAuth: []
    *     parameters:
    *       - name: chapterId
    *         in: path
    *         required: true
    *         description: Chapter ID
    *         schema:
    *           type: string
    *           example: "cchapter1234567890abcdef"
    *       - $ref: '#/components/parameters/StreamingUserQueryParam'
    *       - name: bandwidth
    *         in: query
    *         required: false
    *         description: Optional client bandwidth in bps for bitrate selection
    *         schema: { type: integer, example: 500000 }
    *       - name: bitrate
    *         in: query
    *         required: false
    *         description: Optional preferred bitrate in kbps
    *         schema: { type: integer, example: 128 }
    *     responses:
    *       200:
    *         description: Master playlist retrieved successfully
    *         content:
    *           application/vnd.apple.mpegurl:
    *             schema:
    *               type: string
    *       400:
    *         $ref: '#/components/responses/ValidationError'
    *       401:
    *         $ref: '#/components/responses/UnauthorizedError'
    *       404:
    *         $ref: '#/components/responses/NotFoundError'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   router.get(
      '/chapters/:chapterId/master.m3u8',
      validateStreamingParams,
      chapterStreamAccess,
      proxyToStreamingService
   );

   /**
    * @swagger
    * /api/v1/stream/chapters/{chapterId}/{bitrate}/playlist.m3u8:
    *   get:
    *     summary: Get bitrate-specific playlist for chapter
    *     description: |
    *       Retrieve the HLS playlist for a specific chapter and bitrate.
    *       Authentication: provide **either** Bearer token **or** `user` query param (one is required).
    *     tags: [Streaming]
    *     security:
    *       - bearerAuth: []
    *     parameters:
    *       - name: chapterId
    *         in: path
    *         required: true
    *         description: Chapter ID
    *         schema:
    *           type: string
    *           example: "cchapter1234567890abcdef"
    *       - name: bitrate
    *         in: path
    *         required: true
    *         description: Audio bitrate in kbps
    *         schema:
    *           type: string
    *           example: "128"
    *       - $ref: '#/components/parameters/StreamingUserQueryParam'
    *     responses:
    *       200:
    *         description: Playlist retrieved successfully
    *         content:
    *           application/vnd.apple.mpegurl:
    *             schema:
    *               type: string
    *       400:
    *         $ref: '#/components/responses/ValidationError'
    *       401:
    *         $ref: '#/components/responses/UnauthorizedError'
    *       404:
    *         $ref: '#/components/responses/NotFoundError'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   router.get(
      '/chapters/:chapterId/:bitrate/playlist.m3u8',
      validateStreamingParams,
      chapterStreamAccess,
      proxyToStreamingService
   );

   /**
    * @swagger
    * /api/v1/stream/chapters/{chapterId}/{bitrate}/segments/{segmentId}:
    *   get:
    *     summary: Get audio segment
    *     description: |
    *       Retrieve a specific audio segment for streaming.
    *       Authentication: provide **either** Bearer token **or** `user` query param (one is required).
    *     tags: [Streaming]
    *     security:
    *       - bearerAuth: []
    *     parameters:
    *       - name: chapterId
    *         in: path
    *         required: true
    *         description: Chapter ID
    *         schema:
    *           type: string
    *           example: "cchapter1234567890abcdef"
    *       - name: bitrate
    *         in: path
    *         required: true
    *         description: Audio bitrate in kbps
    *         schema:
    *           type: string
    *           example: "128"
    *       - name: segmentId
    *         in: path
    *         required: true
    *         description: Segment filename (e.g. segment_001.m4s)
    *         schema:
    *           type: string
    *           example: "segment_001.m4s"
    *       - $ref: '#/components/parameters/StreamingUserQueryParam'
    *     responses:
    *       200:
    *         description: Audio segment retrieved successfully
    *         content:
    *           video/mp4:
    *             schema:
    *               type: string
    *               format: binary
    *           video/mp2t:
    *             schema:
    *               type: string
    *               format: binary
    *       400:
    *         $ref: '#/components/responses/ValidationError'
    *       401:
    *         $ref: '#/components/responses/UnauthorizedError'
    *       404:
    *         $ref: '#/components/responses/NotFoundError'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   router.get(
      '/chapters/:chapterId/:bitrate/segments/:segmentId',
      validateStreamingParams,
      chapterStreamAccess,
      proxyToStreamingService
   );

   /**
    * @swagger
    * /api/v1/stream/chapters/{chapterId}/status:
    *   get:
    *     summary: Get chapter processing status
    *     description: |
    *       Check the transcoding/processing status of a chapter.
    *       Authentication: provide **either** Bearer token **or** `user` query param (one is required).
    *     tags: [Streaming]
    *     security:
    *       - bearerAuth: []
    *     parameters:
    *       - name: chapterId
    *         in: path
    *         required: true
    *         description: Chapter ID
    *         schema:
    *           type: string
    *           example: "cchapter1234567890abcdef"
    *       - $ref: '#/components/parameters/StreamingUserQueryParam'
    *     responses:
    *       200:
    *         description: Status retrieved successfully
    *         content:
    *           application/json:
    *             schema:
    *               type: object
    *               properties:
    *                 status:
    *                   type: string
    *                   example: "completed"
    *                 progress:
    *                   type: number
    *                   example: 100
    *       400:
    *         $ref: '#/components/responses/ValidationError'
    *       401:
    *         $ref: '#/components/responses/UnauthorizedError'
    *       404:
    *         $ref: '#/components/responses/NotFoundError'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   router.get(
      '/chapters/:chapterId/status',
      validateStreamingParams,
      chapterStreamAccess,
      proxyToStreamingService
   );

   /**
    * @swagger
    * /api/v1/stream/chapters/{chapterId}/transcoding:
    *   get:
    *     summary: Detailed per-bitrate transcoding status (proxied)
    *     tags: [Streaming]
    *     security:
    *       - bearerAuth: []
    *     parameters:
    *       - name: chapterId
    *         in: path
    *         required: true
    *         schema: { type: string }
    *       - $ref: '#/components/parameters/StreamingUserQueryParam'
    *     responses:
    *       200:
    *         description: Detailed transcoding status with per-bitrate progress
    *       401:
    *         $ref: '#/components/responses/UnauthorizedError'
    */
   router.get(
      '/chapters/:chapterId/transcoding',
      validateStreamingParams,
      chapterStreamAccess,
      proxyToStreamingService
   );

   /**
    * @swagger
    * /api/v1/stream/chapters/{chapterId}/transcoding/events:
    *   get:
    *     summary: SSE live transcoding events for one chapter (proxied)
    *     tags: [Streaming]
    *     security:
    *       - bearerAuth: []
    *     parameters:
    *       - name: chapterId
    *         in: path
    *         required: true
    *         schema: { type: string }
    *       - $ref: '#/components/parameters/StreamingUserQueryParam'
    *     responses:
    *       200:
    *         description: text/event-stream with snapshot and transcoding events
    *         content:
    *           text/event-stream:
    *             schema: { type: string }
    *       401:
    *         $ref: '#/components/responses/UnauthorizedError'
    */
   router.get(
      '/chapters/:chapterId/transcoding/events',
      validateStreamingParams,
      chapterStreamAccess,
      proxyStreamToStreamingService
   );

   /**
    * @swagger
    * /api/v1/stream/transcoding/events:
    *   get:
    *     summary: Multiplexed SSE for chapter list (proxied)
    *     tags: [Streaming]
    *     security:
    *       - bearerAuth: []
    *     parameters:
    *       - name: chapterIds
    *         in: query
    *         required: true
    *         schema: { type: string, example: 'ch1,ch2' }
    *       - $ref: '#/components/parameters/StreamingUserQueryParam'
    *     responses:
    *       200:
    *         description: text/event-stream
    *         content:
    *           text/event-stream:
    *             schema: { type: string }
    *       401:
    *         $ref: '#/components/responses/UnauthorizedError'
    */
   router.get(
      '/transcoding/events',
      proxyStreamToStreamingService
   );

   /**
    * @swagger
    * /api/v1/stream/chapters/{chapterId}/transcode/retry:
    *   post:
    *     summary: Retry failed bitrates (proxied; inputPath resolved server-side)
    *     tags: [Streaming]
    *     security:
    *       - bearerAuth: []
    *     parameters:
    *       - name: chapterId
    *         in: path
    *         required: true
    *         schema: { type: string }
    *       - $ref: '#/components/parameters/StreamingUserQueryParam'
    *     requestBody:
    *       content:
    *         application/json:
    *           schema:
    *             type: object
    *             properties:
    *               bitrates:
    *                 type: array
    *                 items: { type: integer }
    *     responses:
    *       200:
    *         description: Retry initiated
    *       401:
    *         $ref: '#/components/responses/UnauthorizedError'
    *       404:
    *         $ref: '#/components/responses/NotFoundError'
    */
   router.post(
      '/chapters/:chapterId/transcode/retry',
      validateStreamingParams,
      chapterStreamAccess,
      proxyPostToStreamingService
   );

   /**
    * @swagger
    * /api/v1/stream/chapters/{chapterId}/preload:
    *   post:
    *     summary: Preload chapter for streaming
    *     description: |
    *       Proxied to streaming-service. Triggers cache warming for chapter segments.
    *       Authentication: provide **either** Bearer token **or** `user` query param (one is required).
    *     tags: [Streaming]
    *     security:
    *       - bearerAuth: []
    *     parameters:
    *       - name: chapterId
    *         in: path
    *         required: true
    *         description: Chapter ID
    *         schema:
    *           type: string
    *           example: "cchapter1234567890abcdef"
    *       - $ref: '#/components/parameters/StreamingUserQueryParam'
    *     requestBody:
    *       required: false
    *       content:
    *         application/json:
    *           schema:
    *             type: object
    *             properties:
    *               bitrate: { type: integer, example: 128, description: "Optional bitrate in kbps (defaults to highest available)" }
    *           examples:
    *             defaultBitrate:
    *               summary: Preload with default (highest) bitrate
    *               value: {}
    *             specificBitrate:
    *               summary: Preload specific bitrate
    *               value:
    *                 bitrate: 128
    *     responses:
    *       200:
    *         description: Preload initiated successfully
    *         content:
    *           application/json:
    *             schema:
    *               allOf:
    *                 - $ref: '#/components/schemas/ApiResponse'
    *                 - type: object
    *                   properties:
    *                     data:
    *                       type: object
    *                       properties:
    *                         chapterId: { type: string }
    *                         bitrate: { type: integer }
    *                         status: { type: string, example: "preloaded" }
    *       400:
    *         $ref: '#/components/responses/ValidationError'
    *       401:
    *         $ref: '#/components/responses/UnauthorizedError'
    *       404:
    *         $ref: '#/components/responses/NotFound'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   router.post(
      '/chapters/:chapterId/preload',
      validateStreamingParams,
      chapterStreamAccess,
      proxyToStreamingService
   );

   return router;
}
