import { AudioBookController } from '../../controllers/AudioBookController';
import { AudioBookService } from '../../services/AudioBookService';
import { ResponseHandler } from '../../utils/ResponseHandler';
import { AuthRole } from '../../constants/authRoles';

jest.mock('../../services/AudioBookService');
jest.mock('../../middleware/UploadMiddleware', () => ({
   getFileUrl: jest.fn((path: string) => 'https://example.com' + path),
}));
jest.mock('../../utils/MessageHandler', () => ({
   MessageHandler: {
      getErrorMessage: (key: string) => key,
      getSuccessMessage: (key: string) => key,
   },
}));
jest.mock('../../utils/ResponseHandler', () => ({
   ResponseHandler: {
      success: jest.fn(),
      forbidden: jest.fn(),
      paginated: jest.fn(),
      noContent: jest.fn(),
      validationError: jest.fn(),
      calculatePagination: jest.fn().mockReturnValue({}),
   },
}));

const flushPromises = (): Promise<void> =>
   new Promise<void>((resolve) => setImmediate(resolve));

describe('AudioBookController subscription gating', () => {
   const authUserId = 'auth-admin';
   const accessToken = 'test-jwt-token';
   const audiobookId = 'audiobook-1';
   const orgId = 'org-1';

   let mockPrisma: any;
   let mockReq: any;
   let mockRes: any;
   let mockAudioBookService: jest.Mocked<AudioBookService>;
   let controller: AudioBookController;

   beforeEach(() => {
      jest.clearAllMocks();
      mockPrisma = {};
      mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
      mockReq = {
         params: { id: audiobookId },
         query: {},
         body: {},
         headers: { authorization: `Bearer ${accessToken}` },
         user: { id: authUserId, role: AuthRole.GLOBAL_ADMIN },
      };
      mockReq.next = jest.fn();
      controller = new AudioBookController(mockPrisma);
      mockAudioBookService = (controller as any).audioBookService;
      mockAudioBookService.getUserReviewRatingForAudiobook = jest
         .fn()
         .mockResolvedValue(null) as any;
   });

   it('returns denied subscriptionAccess when tier is too low', async () => {
      const mockBook = {
         id: audiobookId,
         title: 'Gated Book',
         owner: { type: 'ORGANIZATION', id: orgId },
         subscriptionGatingMode: 'AUDIOBOOK',
         minSubscriptionTier: 2,
         isPublic: false,
      };
      mockAudioBookService.getAudioBookById.mockResolvedValue(mockBook as any);
      mockAudioBookService.getSubscriptionAccessForAudiobook = jest.fn().mockResolvedValue({
         canAccess: false,
         message: 'forbidden.subscription_tier_too_low',
         requiredTier: 2,
         userTier: 1,
      }) as any;

      await controller.getAudioBookById(mockReq, mockRes, mockReq.next);
      await flushPromises();

      expect(mockAudioBookService.getSubscriptionAccessForAudiobook).toHaveBeenCalledWith(
         audiobookId,
         {
            subscriptionGatingMode: 'AUDIOBOOK',
            minSubscriptionTier: 2,
         },
         authUserId,
         accessToken,
      );
      expect(ResponseHandler.success).toHaveBeenCalled();
   });
});
