/**
 * UserAudioBookController Tests
 * Tests for HTTP request handling and response formatting
 */
import { PrismaClient } from '@prisma/client';
import { UserAudioBookController } from '../../controllers/UserAudioBookController';
import { UserAudioBookService } from '../../services/UserAudioBookService';
import { ResponseHandler } from '../../utils/ResponseHandler';
import { MessageHandler } from '../../utils/MessageHandler';
import { ApiError } from '../../types/ApiError';
import { HttpStatusCode } from '../../types/common';
import { UserAudioBookType } from '@prisma/client';

// Mock dependencies
jest.mock('../../services/UserAudioBookService');
jest.mock('../../utils/ResponseHandler');
jest.mock('../../utils/MessageHandler');

describe('UserAudioBookController', () => {
   let userAudioBookController: UserAudioBookController;
   let mockPrisma: PrismaClient;
   let mockReq: any;
   let mockRes: any;
   let mockUserAudioBookService: jest.Mocked<UserAudioBookService>;
   let mockNext: jest.Mock;

   beforeEach(() => {
      // Create mock Prisma
      mockPrisma = {} as PrismaClient;

      // Create mock request
      mockReq = {
         params: {},
         query: {},
         body: {},
         originalUrl: '/api/v1/user-audiobooks'
      } as any;

      // Create mock response
      mockRes = {
         status: jest.fn().mockReturnThis(),
         json: jest.fn().mockReturnThis(),
         send: jest.fn().mockReturnThis()
      } as any;

      // Mock next function for async handler
      mockNext = jest.fn();

      // Setup MessageHandler mock
      (MessageHandler.getSuccessMessage as jest.Mock).mockImplementation((k: string) => k);

      // Clear all mocks
      jest.clearAllMocks();

      // Create controller instance
      userAudioBookController = new UserAudioBookController(mockPrisma);

      // Get the mocked UserAudioBookService instance
      mockUserAudioBookService = (userAudioBookController as any).userAudioBookService;
   });

   describe('createUserAudioBook', () => {
      it('creates and returns 201', async () => {
         const mockUserAudioBook = {
            id: 'ua1',
            userId: 'user1',
            audiobookId: 'book1',
            type: UserAudioBookType.PURCHASED,
            createdAt: new Date(),
            updatedAt: new Date()
         };

         mockReq.body = {
            userId: 'user1',
            audiobookId: 'book1'
         };

         mockUserAudioBookService.createUserAudioBook.mockResolvedValue(mockUserAudioBook as any);
         (MessageHandler.getSuccessMessage as jest.Mock).mockReturnValue('User-audiobook relationship created successfully');

         await userAudioBookController.createUserAudioBook(mockReq, mockRes, mockNext);

         expect(mockUserAudioBookService.createUserAudioBook).toHaveBeenCalledWith({
            userId: 'user1',
            audiobookId: 'book1'
         });
         expect(ResponseHandler.success).toHaveBeenCalledWith(
            mockRes,
            mockUserAudioBook,
            'User-audiobook relationship created successfully',
            201
         );
      });
   });

   describe('getAllUserAudioBooks', () => {
      it('retrieves all user-audiobook relationships and sends success response', async () => {
         const mockUserAudioBooks = [
            {
               id: 'ua1',
               userId: 'user1',
               audiobookId: 'book1',
               type: UserAudioBookType.OWNED,
               createdAt: new Date(),
               updatedAt: new Date()
            },
            {
               id: 'ua2',
               userId: 'user2',
               audiobookId: 'book2',
               type: UserAudioBookType.PURCHASED,
               createdAt: new Date(),
               updatedAt: new Date()
            }
         ];

         mockUserAudioBookService.getAllUserAudioBooks.mockResolvedValue({
            userAudioBooks: mockUserAudioBooks as any,
            totalCount: 2
         });
         (MessageHandler.getSuccessMessage as jest.Mock).mockReturnValue('User-audiobook relationships retrieved successfully');

         await userAudioBookController.getAllUserAudioBooks(mockReq, mockRes, mockNext);

         expect(mockUserAudioBookService.getAllUserAudioBooks).toHaveBeenCalledTimes(1);
         expect(ResponseHandler.paginated).toHaveBeenCalled();
      });

      it('handles empty list', async () => {
         mockUserAudioBookService.getAllUserAudioBooks.mockResolvedValue({
            userAudioBooks: [],
            totalCount: 0
         });
         (MessageHandler.getSuccessMessage as jest.Mock).mockReturnValue('User-audiobook relationships retrieved successfully');

         await userAudioBookController.getAllUserAudioBooks(mockReq, mockRes, mockNext);

         expect(mockUserAudioBookService.getAllUserAudioBooks).toHaveBeenCalledTimes(1);
         expect(ResponseHandler.paginated).toHaveBeenCalled();
      });

      it('propagates service errors', async () => {
         const error = new ApiError('Internal server error', HttpStatusCode.INTERNAL_SERVER_ERROR);
         mockUserAudioBookService.getAllUserAudioBooks.mockRejectedValue(error);

         try {
            await userAudioBookController.getAllUserAudioBooks(mockReq, mockRes, mockNext);
         } catch (e) {
            expect(e).toEqual(error);
         }
         expect(mockUserAudioBookService.getAllUserAudioBooks).toHaveBeenCalledTimes(1);
         expect(ResponseHandler.paginated).not.toHaveBeenCalled();
      });
   });

   describe('getUserAudioBookById', () => {
      it('returns user-audiobook relationship', async () => {
         const mockUserAudioBook = {
            id: 'ua1',
            userId: 'user1',
            audiobookId: 'book1',
            type: UserAudioBookType.OWNED,
            createdAt: new Date(),
            updatedAt: new Date(),
            user: {
               id: 'user1',
               userId: 'user-123',
               username: 'testuser',
               firstName: 'Test',
               lastName: 'User'
            },
            audiobook: {
               id: 'book1',
               title: 'Test Book',
               author: 'Test Author',
               narrator: 'Test Narrator',
               coverImage: 'image.jpg'
            }
         };

         mockReq.params = { id: 'ua1' };
         mockUserAudioBookService.getUserAudioBookById.mockResolvedValue(mockUserAudioBook as any);
         (MessageHandler.getSuccessMessage as jest.Mock).mockReturnValue('User-audiobook relationship retrieved successfully');

         await userAudioBookController.getUserAudioBookById(mockReq, mockRes, mockNext);

         expect(mockUserAudioBookService.getUserAudioBookById).toHaveBeenCalledWith('ua1');
         expect(ResponseHandler.success).toHaveBeenCalledWith(
            mockRes,
            mockUserAudioBook,
            'User-audiobook relationship retrieved successfully'
         );
      });
   });

   describe('deleteUserAudioBook', () => {
      it('deletes and returns success', async () => {
         mockReq.params = { id: 'ua1' };
         mockUserAudioBookService.deleteUserAudioBook.mockResolvedValue(true);
         (MessageHandler.getSuccessMessage as jest.Mock).mockReturnValue('User-audiobook relationship deleted successfully');

         await userAudioBookController.deleteUserAudioBook(mockReq, mockRes, mockNext);

         expect(mockUserAudioBookService.deleteUserAudioBook).toHaveBeenCalledWith('ua1');
         expect(ResponseHandler.success).toHaveBeenCalledWith(
            mockRes,
            { deleted: true },
            'User-audiobook relationship deleted successfully'
         );
      });
   });

   describe('getUserAudioBooksByUserId', () => {
      it('returns user-audiobook relationships for a user', async () => {
         const mockUserAudioBooks = [
            {
               id: 'ua1',
               userId: 'user1',
               audiobookId: 'book1',
               type: UserAudioBookType.OWNED,
               createdAt: new Date(),
               updatedAt: new Date()
            }
         ];

         mockReq.params = { userId: 'user1' };
         mockUserAudioBookService.getUserAudioBooksByUserId.mockResolvedValue({
            userAudioBooks: mockUserAudioBooks as any,
            totalCount: 1
         });
         (MessageHandler.getSuccessMessage as jest.Mock).mockReturnValue('User-audiobook relationships retrieved successfully');

         await userAudioBookController.getUserAudioBooksByUserId(mockReq, mockRes, mockNext);

         expect(mockUserAudioBookService.getUserAudioBooksByUserId).toHaveBeenCalledWith('user1', expect.any(Object));
         expect(ResponseHandler.paginated).toHaveBeenCalled();
      });
   });

   describe('getUserAudioBooksByAudiobookId', () => {
      it('returns user-audiobook relationships for an audiobook', async () => {
         const mockUserAudioBooks = [
            {
               id: 'ua1',
               userId: 'user1',
               audiobookId: 'book1',
               type: UserAudioBookType.OWNED,
               createdAt: new Date(),
               updatedAt: new Date()
            }
         ];

         mockReq.params = { audiobookId: 'book1' };
         mockUserAudioBookService.getUserAudioBooksByAudiobookId.mockResolvedValue({
            userAudioBooks: mockUserAudioBooks as any,
            totalCount: 1
         });
         (MessageHandler.getSuccessMessage as jest.Mock).mockReturnValue('User-audiobook relationships retrieved successfully');

         await userAudioBookController.getUserAudioBooksByAudiobookId(mockReq, mockRes, mockNext);

         expect(mockUserAudioBookService.getUserAudioBooksByAudiobookId).toHaveBeenCalledWith('book1', expect.any(Object));
         expect(ResponseHandler.paginated).toHaveBeenCalled();
      });
   });

   describe('getUserAudioBooksByType', () => {
      it('returns user-audiobook relationships by type', async () => {
         const mockUserAudioBooks = [
            {
               id: 'ua1',
               userId: 'user1',
               audiobookId: 'book1',
               type: UserAudioBookType.OWNED,
               createdAt: new Date(),
               updatedAt: new Date()
            }
         ];

         mockReq.params = { type: UserAudioBookType.OWNED };
         mockUserAudioBookService.getUserAudioBooksByType.mockResolvedValue({
            userAudioBooks: mockUserAudioBooks as any,
            totalCount: 1
         });
         (MessageHandler.getSuccessMessage as jest.Mock).mockReturnValue('User-audiobook relationships retrieved successfully');

         await userAudioBookController.getUserAudioBooksByType(mockReq, mockRes, mockNext);

         expect(mockUserAudioBookService.getUserAudioBooksByType).toHaveBeenCalledWith(
            UserAudioBookType.OWNED,
            expect.any(Object)
         );
         expect(ResponseHandler.paginated).toHaveBeenCalled();
      });
   });
});

