/**
 * User Profile Routes
 * Handles endpoints for the current user's profile
 */
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { UserProfileController } from '../controllers/UserProfileController';
import { ValidationMiddleware } from '../middleware/ValidationMiddleware';
import { UploadMiddleware } from '../middleware/UploadMiddleware';

export function createUserProfileRoutes(prisma: PrismaClient): Router {
   const router = Router();
   const userProfileController = new UserProfileController(prisma);

   // Get current user's profile
   router.get(
      '/user/profile',
      userProfileController.getProfile
   );

   // Get a specific user's profile (avatar, username)
   router.get(
      '/users/:userId/profile',
      userProfileController.getProfileByUserId
   );

   // Update current user's profile
   router.put(
      '/user/profile',
      UploadMiddleware.handleOptionalAvatarUpload,
      ValidationMiddleware.validateUserProfileUpdate,
      userProfileController.updateProfile
   );

   return router;
}


