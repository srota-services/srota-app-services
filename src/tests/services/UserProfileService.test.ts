/**
 * UserProfileService Tests
 */

import { UserProfileService } from '../../services/UserProfileService';
import { attachPrismaTransaction } from '../helpers/prismaMock';

jest.mock('../../services/FileUrlService', () => ({
   fileUrlService: {
      resolveForClient: jest.fn(async (value?: string | null) => value ?? undefined),
      resolveUserMedia: jest.fn(async (profile: { id: string; avatar?: string | null }) => ({
         ...profile,
         avatar: profile.avatar ?? undefined,
         imageAssets: {},
      })),
   },
}));

jest.mock('../../utils/UsernameGenerator', () => ({
   UsernameGenerator: jest.fn().mockImplementation(() => ({
      generateUniqueUsername: jest.fn().mockResolvedValue({ username: 'happy_otter_1234', attempts: 1 }),
   })),
}));

const mockPrisma = attachPrismaTransaction({
   userProfile: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
   },
}) as any;

describe('UserProfileService', () => {
   let userProfileService: UserProfileService;

   beforeEach(() => {
      jest.clearAllMocks();
      userProfileService = new UserProfileService(mockPrisma);
   });

   describe('getUserProfile', () => {
      it('should return user profile by userId', async () => {
         const userId = 'user-123';
         const mockProfile = {
            id: 'profile-1',
            userId,
            username: 'testuser',
            avatar: 'avatar.jpg',
            preferences: { theme: 'dark' },
            createdAt: new Date(),
            updatedAt: new Date(),
         };

         mockPrisma.userProfile.findUnique.mockResolvedValue(mockProfile);

         const result = await userProfileService.getUserProfile(userId);

         expect(result).toEqual({ ...mockProfile, imageAssets: {} });
         expect(mockPrisma.userProfile.findUnique).toHaveBeenCalledWith({
            where: { userId },
            select: {
               id: true,
               userId: true,
               username: true,
               avatar: true,
               preferences: true,
               createdAt: true,
               updatedAt: true,
            },
         });
      });
   });

   describe('updateUserProfile', () => {
      it('should update app-local profile fields', async () => {
         const userId = 'user-123';
         const updateData = {
            username: 'updated-username',
            preferences: { theme: 'dark', language: 'fr' },
         };

         const updatedProfile = {
            id: 'profile-1',
            userId,
            username: 'updated-username',
            avatar: null,
            preferences: { theme: 'dark', language: 'fr' },
            updatedAt: new Date(),
         };

         mockPrisma.userProfile.update.mockResolvedValue(updatedProfile);

         const result = await userProfileService.updateUserProfile(userId, updateData);

         expect(result).toEqual({
            ...updatedProfile,
            avatar: undefined,
            imageAssets: {},
         });
      });
   });

   describe('createUserProfile', () => {
      it('should create profile with username and optional avatar only', async () => {
         mockPrisma.userProfile.findUnique.mockResolvedValue(null);
         mockPrisma.userProfile.create.mockResolvedValue({
            id: 'profile-1',
            userId: 'user-123',
            username: 'happy_otter_1234',
         });

         const result = await userProfileService.createUserProfile('user-123', {
            avatar: 'uploads/images/users/avatar.jpg',
         });

         expect(result.success).toBe(true);
         expect(mockPrisma.userProfile.create).toHaveBeenCalledWith(
            expect.objectContaining({
               data: expect.objectContaining({
                  userId: 'user-123',
                  avatar: 'uploads/images/users/avatar.jpg',
               }),
            }),
         );
      });
   });
});
