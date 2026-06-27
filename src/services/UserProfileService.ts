/**
 * UserProfile Service
 * Handles app-local user profile creation and management (username, avatar, preferences)
 */
import { PrismaClient } from '@prisma/client';
import { UsernameGenerator } from '../utils/UsernameGenerator';
import { UserProfileCreationResult } from '../types/user-events';
import { fileUrlService } from './FileUrlService';
import { ImageAssetService } from './ImageAssetService';
import { mediaCleanupService } from './MediaCleanupService';
import { emitCacheInvalidation } from './DomainEventPublisher';
import { runWrite } from '../utils/prismaTransaction';

export class UserProfileService {
   private prisma: PrismaClient;
   private usernameGenerator: UsernameGenerator;
   private imageAssetService: ImageAssetService;

   constructor(prisma: PrismaClient) {
      this.prisma = prisma;
      this.usernameGenerator = new UsernameGenerator(prisma);
      this.imageAssetService = new ImageAssetService(prisma);
   }

   /**
    * Create user profile
    */
   async createUserProfile(
      userId: string,
      options?: {
         avatar?: string;
      }
   ): Promise<UserProfileCreationResult> {
      try {
         const existingProfile = await this.prisma.userProfile.findUnique({
            where: { userId },
            select: { id: true, username: true }
         });

         if (existingProfile) {
            return {
               success: false,
               error: 'User profile already exists'
            };
         }

         const usernameResult = await this.usernameGenerator.generateUniqueUsername();

         const profileData: {
            userId: string;
            username: string;
            avatar?: string;
            preferences: {
               theme: string;
               language: string;
               autoPlay: boolean;
               playbackSpeed: number;
            };
         } = {
            userId,
            username: usernameResult.username,
            preferences: {
               theme: 'light',
               language: 'en',
               autoPlay: false,
               playbackSpeed: 1.0
            }
         };

         if (options?.avatar) {
            profileData.avatar = options.avatar;
         }

         const userProfile = await runWrite(this.prisma, async (tx) =>
            tx.userProfile.create({
               data: profileData,
               select: {
                  id: true,
                  userId: true,
                  username: true
               }
            }),
         );

         emitCacheInvalidation('user-profile', 'created', userProfile.id, { userId });
         return {
            success: true,
            userProfile: {
               id: userProfile.id,
               userId: userProfile.userId,
               username: userProfile.username
            }
         };
      } catch (error: any) {
         return {
            success: false,
            error: error.message || 'Failed to create user profile'
         };
      }
   }

   /**
    * Get user profile by userId
    */
   async getUserProfile(userId: string): Promise<any> {
      try {
         const userProfile = await this.prisma.userProfile.findUnique({
            where: { userId },
            select: {
               id: true,
               userId: true,
               username: true,
               avatar: true,
               preferences: true,
               createdAt: true,
               updatedAt: true
            }
         });

         if (!userProfile) {
            return userProfile;
         }

         return this.resolveProfileForClient(userProfile);
      } catch (error: any) {
         throw error;
      }
   }

   /**
    * Update user profile
    */
   async updateUserProfile(
      userId: string,
      updateData: {
         username?: string;
         avatar?: string;
         preferences?: any;
      },
      avatarSourcePath?: string,
   ): Promise<any> {
      try {
         const existing = await this.prisma.userProfile.findUnique({
            where: { userId },
            select: { id: true, avatar: true },
         });

         if (!existing) {
            throw new Error('User profile not found');
         }

         const data: {
            username?: string;
            avatar?: string;
            preferences?: any;
         } = { ...updateData };

         if (avatarSourcePath) {
            delete data.avatar;
         }

         let userProfile = await runWrite(this.prisma, async (tx) =>
            tx.userProfile.update({
               where: { userId },
               data,
               select: {
                  id: true,
                  userId: true,
                  username: true,
                  avatar: true,
                  preferences: true,
                  updatedAt: true
               }
            }),
         );

         if (avatarSourcePath) {
            const { primaryStorageKey } = await this.imageAssetService.generateAndStoreVariants(
               'user',
               existing.id,
               avatarSourcePath,
            );
            userProfile = await runWrite(this.prisma, async (tx) =>
               tx.userProfile.update({
                  where: { userId },
                  data: { avatar: primaryStorageKey },
                  select: {
                     id: true,
                     userId: true,
                     username: true,
                     avatar: true,
                     preferences: true,
                     updatedAt: true
                  }
               }),
            );
         } else if (updateData.avatar !== undefined && updateData.avatar !== existing.avatar) {
            await this.imageAssetService.deleteAssetsForEntity('user', existing.id);
            await mediaCleanupService.deleteStoredFile(existing.avatar);
         }

         emitCacheInvalidation('user-profile', 'updated', existing.id, { userId });
         return this.resolveProfileForClient(userProfile);
      } catch (error: any) {
         throw error;
      }
   }

   /**
    * Delete user profile
    */
   async deleteUserProfile(userId: string): Promise<void> {
      try {
         const existing = await this.prisma.userProfile.findUnique({
            where: { userId },
            select: { id: true, avatar: true },
         });

         if (existing) {
            await this.imageAssetService.deleteAssetsForEntity('user', existing.id);
            await mediaCleanupService.deleteStoredFile(existing.avatar);
         }

         await runWrite(this.prisma, async (tx) =>
            tx.userProfile.delete({
               where: { userId }
            }),
         );

         if (existing) {
            emitCacheInvalidation('user-profile', 'deleted', existing.id, { userId });
         }
      } catch (error: any) {
         throw error;
      }
   }

   private async resolveProfileForClient(profile: {
      id: string;
      userId: string;
      username: string;
      avatar: string | null;
      preferences: unknown;
      createdAt?: Date;
      updatedAt?: Date;
   }) {
      return fileUrlService.resolveUserMedia({
         ...profile,
         avatar: profile.avatar ?? undefined,
      });
   }
}
