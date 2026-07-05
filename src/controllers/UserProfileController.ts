import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { ErrorHandler } from '../middleware/ErrorHandler';
import { ResponseHandler } from '../utils/ResponseHandler';
import { MessageHandler } from '../utils/MessageHandler';
import { UserProfileService } from '../services/UserProfileService';
import { UpdateUserProfileDto } from '../models/UserDto';

export class UserProfileController {
   private userProfileService: UserProfileService;

   constructor(prisma: PrismaClient) {
      this.userProfileService = new UserProfileService(prisma);
   }

   /**
    * @swagger
    * /api/v1/user/profile:
    *   get:
    *     summary: Get current user's app profile
    *     description: Retrieve username, avatar, and preferences for the authenticated user
    *     tags: [Auth]
    *     responses:
    *       200:
    *         description: Profile retrieved successfully
    *       401:
    *         $ref: '#/components/responses/Unauthorized'
    *       404:
    *         $ref: '#/components/responses/NotFound'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   getProfile = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const userId = (req as any).user.id;
      const profile = await this.userProfileService.getUserProfile(userId);
      ResponseHandler.success(res, profile, MessageHandler.getSuccessMessage('auth.profile_retrieved'));
   });

   /**
    * @swagger
    * /api/v1/users/{userId}/profile:
    *   get:
    *     summary: Get a user's app profile by user ID
    *     description: Retrieve username and avatar for a specific user
    *     tags: [Auth]
    *     parameters:
    *       - in: path
    *         name: userId
    *         required: true
    *         schema:
    *           type: string
    *     responses:
    *       200:
    *         description: Profile retrieved successfully
    *       404:
    *         $ref: '#/components/responses/NotFound'
    *       401:
    *         $ref: '#/components/responses/Unauthorized'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   getProfileByUserId = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const userId = req.params['userId'];

      if (!userId) {
         ResponseHandler.validationError(res, 'User ID is required', req.originalUrl);
         return;
      }

      const profile = await this.userProfileService.getUserProfile(userId);

      if (!profile) {
         ResponseHandler.notFound(res, 'User profile', req.originalUrl);
         return;
      }

      ResponseHandler.success(res, profile, MessageHandler.getSuccessMessage('auth.profile_retrieved'));
   });

   /**
    * @swagger
    * /api/v1/user/profile:
    *   put:
    *     summary: Update current user's app profile
    *     description: Update username, avatar, and preferences. Demographic fields are managed by auth-service.
    *     tags: [Auth]
    *     requestBody:
    *       required: true
    *       content:
    *         multipart/form-data:
    *           schema:
    *             type: object
    *             properties:
    *               username:
    *                 type: string
    *               avatar:
    *                 type: string
    *                 format: binary
    *               preferences:
    *                 type: object
    *         application/json:
    *           schema:
    *             $ref: '#/components/schemas/UpdateUserProfileRequest'
    *     responses:
    *       200:
    *         description: Profile updated successfully
    *       400:
    *         $ref: '#/components/responses/ValidationError'
    *       401:
    *         $ref: '#/components/responses/Unauthorized'
    *       500:
    *         $ref: '#/components/responses/InternalServerError'
    */
   updateProfile = ErrorHandler.asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const userId = (req as any).user.id;
      const updateData: Parameters<UserProfileService['updateUserProfile']>[1] = {
         ...(req.body as UpdateUserProfileDto),
      };

      const avatarFile = (req as Request & { avatarFile?: Express.Multer.File }).avatarFile;

      const updated = await this.userProfileService.updateUserProfile(
         userId,
         updateData,
         avatarFile?.path,
      );

      ResponseHandler.success(res, updated, MessageHandler.getSuccessMessage('auth.profile_updated'));
   });
}
