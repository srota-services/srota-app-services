/**
 * UserProfileController Tests
 */

import { PrismaClient } from '@prisma/client';
import { UserProfileController } from '../../controllers/UserProfileController';
import { UserProfileService } from '../../services/UserProfileService';
import { ResponseHandler } from '../../utils/ResponseHandler';
import { MessageHandler } from '../../utils/MessageHandler';

jest.mock('../../services/UserProfileService');
jest.mock('../../services/FileUrlService', () => ({
   fileUrlService: {
      processUploadedImageFile: jest.fn(async (path: string) => `https://example.com${path}`),
   },
}));
jest.mock('../../utils/ResponseHandler');
jest.mock('../../utils/MessageHandler');

describe('UserProfileController', () => {
   let controller: UserProfileController;
   let mockPrisma: PrismaClient;
   let mockReq: any;
   let mockRes: any;
   let mockService: jest.Mocked<UserProfileService>;

   beforeEach(() => {
      mockPrisma = {} as PrismaClient;
      mockReq = {
         params: {},
         query: {},
         body: {},
         user: { id: 'user-123' },
         originalUrl: '/api/v1/user/profile',
      } as any;
      mockRes = {
         status: jest.fn().mockReturnThis(),
         json: jest.fn().mockReturnThis(),
         send: jest.fn().mockReturnThis(),
      } as any;

      mockReq.next = jest.fn();
      jest.clearAllMocks();

      controller = new UserProfileController(mockPrisma);
      mockService = (controller as any).userProfileService;
   });

   describe('getProfile', () => {
      it('should return current user app profile', async () => {
         const profile = {
            id: 'profile-1',
            userId: 'user-123',
            username: 'testuser',
            avatar: 'avatar.jpg',
            preferences: { theme: 'dark' },
         } as any;

         mockService.getUserProfile.mockResolvedValue(profile);
         (MessageHandler.getSuccessMessage as jest.Mock).mockReturnValue('Profile retrieved');

         await controller.getProfile(mockReq, mockRes, mockReq.next);

         expect(mockService.getUserProfile).toHaveBeenCalledWith('user-123');
         expect(ResponseHandler.success).toHaveBeenCalledWith(
            mockRes,
            profile,
            'Profile retrieved',
         );
      });
   });

   describe('getProfileByUserId', () => {
      it('should return app profile for requested user', async () => {
         const profile = {
            id: 'profile-2',
            userId: 'user-456',
            username: 'memberuser',
            avatar: 'avatar.jpg',
            preferences: { theme: 'light' },
         } as any;

         mockReq.params = { userId: 'user-456' };
         mockService.getUserProfile.mockResolvedValue(profile);
         (MessageHandler.getSuccessMessage as jest.Mock).mockReturnValue('Profile retrieved');

         await controller.getProfileByUserId(mockReq, mockRes, mockReq.next);

         expect(mockService.getUserProfile).toHaveBeenCalledWith('user-456');
         expect(ResponseHandler.success).toHaveBeenCalledWith(
            mockRes,
            profile,
            'Profile retrieved',
         );
      });

      it('should return 404 when profile is missing', async () => {
         mockReq.params = { userId: 'missing-user' };
         mockService.getUserProfile.mockResolvedValue(null);

         await controller.getProfileByUserId(mockReq, mockRes, mockReq.next);

         expect(ResponseHandler.notFound).toHaveBeenCalled();
      });
   });

   describe('updateProfile', () => {
      it('should update username and preferences only', async () => {
         mockReq.body = {
            username: 'newname',
            preferences: { theme: 'dark' },
         };

         const updated = {
            id: 'profile-1',
            userId: 'user-123',
            username: 'newname',
            updatedAt: new Date(),
         } as any;

         mockService.updateUserProfile.mockResolvedValue(updated);
         (MessageHandler.getSuccessMessage as jest.Mock).mockReturnValue('Profile updated');

         await controller.updateProfile(mockReq, mockRes, mockReq.next);

         expect(mockService.updateUserProfile).toHaveBeenCalledWith('user-123', mockReq.body, undefined);
         expect(ResponseHandler.success).toHaveBeenCalledWith(
            mockRes,
            updated,
            'Profile updated',
         );
      });
   });
});
