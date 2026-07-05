/**
 * AudioBookController Tests
 * Tests for HTTP request handling with complex query parameters and file uploads
 */

import { PrismaClient } from '@prisma/client';
import { AudioBookController } from '../../controllers/AudioBookController';
import { AudioBookService } from '../../services/AudioBookService';
import { ResponseHandler } from '../../utils/ResponseHandler';
import { MessageHandler } from '../../utils/MessageHandler';
import { ApiError } from '../../types/ApiError';
import { HttpStatusCode } from '../../types/common';
import { AuthRole } from '../../constants/authRoles';

// Mock dependencies
jest.mock('../../services/AudioBookService');
jest.mock('../../services/FileUrlService', () => ({
   fileUrlService: {
      processUploadedCoverFile: jest.fn(async (path: string) => `https://example.com${path}`),
   },
}));
jest.mock('../../utils/ResponseHandler');
jest.mock('../../utils/MessageHandler');

// The controller is wrapped in `ErrorHandler.asyncHandler` which fires its
// inner async function but returns void synchronously. To make sure all of
// the controller's internal awaits resolve before assertions run, flush
// pending microtasks (and a macrotask round-trip) before asserting.
const flushPromises = (): Promise<void> =>
   new Promise<void>((resolve) => setImmediate(resolve));

describe('AudioBookController', () => {
   let audioBookController: AudioBookController;
   let mockPrisma: PrismaClient;
   let mockReq: any;
   let mockRes: any;
   let mockAudioBookService: jest.Mocked<AudioBookService>;
   let mockContentAuthorizationService: {
      canCreateAudiobook: jest.Mock;
      canManageAudiobook: jest.Mock;
   };

   beforeEach(() => {
      mockPrisma = {} as unknown as PrismaClient;
      mockReq = {
         params: {},
         query: {},
         body: {},
         headers: { authorization: 'Bearer test-token' },
         files: undefined,
         file: undefined,
         originalUrl: '/api/v1/audiobooks',
         // Default the test user to an author for flows that branch on role.
         user: { id: 'auth-user-1', role: AuthRole.AUTHOR },
      } as any;
      mockRes = {
         status: jest.fn().mockReturnThis(),
         json: jest.fn().mockReturnThis(),
         send: jest.fn().mockReturnThis(),
      } as any;

      mockReq.next = jest.fn();
      jest.clearAllMocks();

      audioBookController = new AudioBookController(mockPrisma);
      mockAudioBookService = (audioBookController as any).audioBookService;
      mockContentAuthorizationService = (audioBookController as any).contentAuthorizationService;
      mockContentAuthorizationService.canCreateAudiobook = jest.fn().mockResolvedValue(true);
      mockContentAuthorizationService.canManageAudiobook = jest
         .fn()
         .mockResolvedValue({ audiobookExists: true, allowed: true });
      mockAudioBookService.getSubscriptionAccessForAudiobook = jest
         .fn()
         .mockResolvedValue({ canAccess: true }) as any;
      mockAudioBookService.getUserReviewRatingForAudiobook = jest
         .fn()
         .mockResolvedValue(null) as any;
   });

   describe('getAllAudioBooks', () => {
      it('should retrieve all audiobooks with default pagination', async () => {
         const mockAudiobooks = [
            { id: 'book-1', title: 'Test Book 1' },
            { id: 'book-2', title: 'Test Book 2' },
         ];

         mockAudioBookService.getAllAudioBooks.mockResolvedValue({
            audiobooks: mockAudiobooks as any,
            totalCount: 2
         });
         (ResponseHandler.calculatePagination as jest.Mock).mockReturnValue({
            currentPage: 1,
            totalPages: 1,
            totalItems: 2,
            itemsPerPage: 10,
            hasNextPage: false,
            hasPreviousPage: false,
         });
         (MessageHandler.getSuccessMessage as jest.Mock).mockReturnValue('Audiobooks retrieved');

         await audioBookController.getAllAudioBooks(mockReq, mockRes, mockReq.next);
         await flushPromises();

         expect(mockAudioBookService.getAllAudioBooks).toHaveBeenCalledWith(
            expect.objectContaining({
               page: 1,
               limit: 10,
               sortBy: 'createdAt',
               sortOrder: 'desc',
            }),
            'test-token',
         );
         expect(ResponseHandler.paginated).toHaveBeenCalled();
      });

      it('should parse complex query parameters', async () => {
         mockReq.query = {
            page: '2',
            limit: '20',
            sortBy: 'title',
            sortOrder: 'asc',
            genreId: 'genre-123',
            moodId: 'cmood1234567890abcdefghij',
            languageId: 'cl000000000000000000000002',
            author: 'Test Author',
            narrator: 'Test Narrator',
            isActive: 'true',
            isPublic: 'false',
            search: 'test query'
         };

         mockAudioBookService.getAllAudioBooks.mockResolvedValue({
            audiobooks: [],
            totalCount: 0
         });
         (ResponseHandler.calculatePagination as jest.Mock).mockReturnValue({});
         (MessageHandler.getSuccessMessage as jest.Mock).mockReturnValue('Retrieved');

         await audioBookController.getAllAudioBooks(mockReq, mockRes, mockReq.next);
         await flushPromises();

         expect(mockAudioBookService.getAllAudioBooks).toHaveBeenCalledWith(
            expect.objectContaining({
               page: 2,
               limit: 20,
               sortBy: 'title',
               sortOrder: 'asc',
               genreIds: ['genre-123'],
               moodIds: ['cmood1234567890abcdefghij'],
               languageIds: ['cl000000000000000000000002'],
               author: 'Test Author',
               narrator: 'Test Narrator',
               isActive: true,
               isPublic: false,
               search: 'test query',
            }),
            'test-token',
         );
      });

      it('should handle boolean conversion for isActive and isPublic', async () => {
         mockReq.query = { isActive: 'true', isPublic: 'false' };

         mockAudioBookService.getAllAudioBooks.mockResolvedValue({
            audiobooks: [],
            totalCount: 0
         });
         (ResponseHandler.calculatePagination as jest.Mock).mockReturnValue({});
         (MessageHandler.getSuccessMessage as jest.Mock).mockReturnValue('Retrieved');

         await audioBookController.getAllAudioBooks(mockReq, mockRes, mockReq.next);
         await flushPromises();

         const callArgs = mockAudioBookService.getAllAudioBooks.mock.calls[0]?.[0];
         expect(callArgs?.isActive).toBe(true);
         expect(callArgs?.isPublic).toBe(false);
      });
   });

   describe('getAudioBookById', () => {
      it('should retrieve audiobook by ID with subscription access', async () => {
         mockReq.params.id = 'book-123';
         const mockBook = {
            id: 'book-123',
            title: 'Test Book',
            type: 'PUBLICATION',
            subscriptionGatingMode: 'NONE',
            minSubscriptionTier: null,
         };
         const subscriptionAccess = { canAccess: true };

         mockAudioBookService.getAudioBookById.mockResolvedValue(mockBook as any);
         mockAudioBookService.getSubscriptionAccessForAudiobook.mockResolvedValue(
            subscriptionAccess as any
         );
         mockAudioBookService.getUserReviewRatingForAudiobook.mockResolvedValue(4);
         (MessageHandler.getSuccessMessage as jest.Mock).mockReturnValue('Retrieved');

         await audioBookController.getAudioBookById(mockReq, mockRes, mockReq.next);
         await flushPromises();

         expect(mockAudioBookService.getAudioBookById).toHaveBeenCalledWith('book-123', 'test-token');
         expect(mockAudioBookService.getSubscriptionAccessForAudiobook).toHaveBeenCalledWith(
            'book-123',
            {
               subscriptionGatingMode: 'NONE',
               minSubscriptionTier: null,
            },
            'auth-user-1',
            'test-token',
            AuthRole.AUTHOR,
         );
         expect(mockAudioBookService.getUserReviewRatingForAudiobook).toHaveBeenCalledWith(
            'book-123',
            'auth-user-1'
         );
         expect(ResponseHandler.success).toHaveBeenCalledWith(
            mockRes,
            { ...mockBook, subscriptionAccess, rating: 4 },
            'Retrieved'
         );
      });
   });

   const mockCoverImageFile = {
      path: '/uploads/covers/cover.jpg',
      size: 102400,
   };

   describe('createAudioBook', () => {
      it('should create audiobook with cover image from upload middleware', async () => {
         mockReq.body = {
            title: 'New Book',
            author: 'Author Name',
            genreIds: '["genre-123"]',
            owner: JSON.stringify({ type: 'ORGANIZATION', id: 'org-1' }),
         };
         (mockReq as any).coverImageFile = mockCoverImageFile;

         const mockBook = { id: 'book-new', title: 'New Book' };
         mockAudioBookService.createAudioBook.mockResolvedValue(mockBook as any);
         (MessageHandler.getSuccessMessage as jest.Mock).mockReturnValue('Created');

         await audioBookController.createAudioBook(mockReq, mockRes, mockReq.next);
         await flushPromises();

         expect(mockContentAuthorizationService.canCreateAudiobook).toHaveBeenCalledWith(
            'auth-user-1',
            { type: 'ORGANIZATION', id: 'org-1' },
            AuthRole.AUTHOR,
            'test-token',
         );
         expect(mockAudioBookService.createAudioBook).toHaveBeenCalledWith(
            expect.objectContaining({
               title: 'New Book',
               author: 'Author Name',
               owner: { type: 'ORGANIZATION', id: 'org-1' },
               genreIds: ['genre-123'],
            }),
            'auth-user-1',
            'test-token',
            '/uploads/covers/cover.jpg',
         );
         expect(ResponseHandler.success).toHaveBeenCalledWith(
            mockRes,
            mockBook,
            'Created',
            HttpStatusCode.CREATED
         );
      });

      it('should return validation error when cover image is missing for publication audiobook', async () => {
         mockReq.body = { title: 'Book without Cover', author: 'Author Name' };
         (MessageHandler.getErrorMessage as jest.Mock).mockReturnValue('Cover image is required for publication audiobooks');

         await audioBookController.createAudioBook(mockReq, mockRes, mockReq.next);

         expect(ResponseHandler.validationError).toHaveBeenCalledWith(
            mockRes,
            'Cover image is required for publication audiobooks',
         );
         expect(mockAudioBookService.createAudioBook).not.toHaveBeenCalled();
      });

      it('should create authoring audiobook without cover image', async () => {
         mockReq.body = {
            title: 'Draft Book',
            author: 'Author Name',
            type: 'AUTHORING',
            owner: JSON.stringify({ type: 'AUTHOR', id: 'author-1' }),
         };
         (mockReq as any).coverImageFile = undefined;

         const mockBook = { id: 'book-authoring', title: 'Draft Book', type: 'AUTHORING' };
         mockAudioBookService.createAudioBook.mockResolvedValue(mockBook as any);
         (MessageHandler.getSuccessMessage as jest.Mock).mockReturnValue('Created');

         await audioBookController.createAudioBook(mockReq, mockRes, mockReq.next);
         await flushPromises();

         expect(mockAudioBookService.createAudioBook).toHaveBeenCalledWith(
            expect.objectContaining({
               title: 'Draft Book',
               type: 'AUTHORING',
            }),
            'auth-user-1',
            'test-token',
            undefined,
         );
         expect(ResponseHandler.success).toHaveBeenCalled();
      });

      it('should handle file upload for cover image', async () => {
         mockReq.body = {
            title: 'Book with Cover',
            author: 'Author Name',
            owner: JSON.stringify({ type: 'ORGANIZATION', id: 'org-1' }),
         };
         (mockReq as any).coverImageFile = mockCoverImageFile;

         const mockBook = { id: 'book-new', title: 'Book with Cover' };
         mockAudioBookService.createAudioBook.mockResolvedValue(mockBook as any);
         (MessageHandler.getSuccessMessage as jest.Mock).mockReturnValue('Created');

         await audioBookController.createAudioBook(mockReq, mockRes, mockReq.next);
         await flushPromises();

         expect(mockAudioBookService.createAudioBook).toHaveBeenCalledWith(
            expect.objectContaining({
               title: 'Book with Cover',
               author: 'Author Name',
               owner: { type: 'ORGANIZATION', id: 'org-1' },
            }),
            'auth-user-1',
            'test-token',
            '/uploads/covers/cover.jpg',
         );
      });

      it('should return validation error when owner is missing', async () => {
         mockReq.body = {
            title: 'No Owner Book',
            author: 'Author Name',
         };
         (mockReq as any).coverImageFile = mockCoverImageFile;

         await audioBookController.createAudioBook(mockReq, mockRes, mockReq.next);
         await flushPromises();

         expect(ResponseHandler.validationError).toHaveBeenCalledWith(
            mockRes,
            'owner is required with type and id',
         );
         expect(mockAudioBookService.createAudioBook).not.toHaveBeenCalled();
      });

      it('should create audiobook for author owner', async () => {
         mockReq.user = { id: 'auth-author-1', role: AuthRole.AUTHOR };
         mockReq.body = {
            title: 'Author Personal Book',
            author: 'Author Name',
            genreIds: '["genre-123"]',
            owner: JSON.stringify({ type: 'AUTHOR', id: 'author-1' }),
         };
         (mockReq as any).coverImageFile = mockCoverImageFile;

         const mockBook = { id: 'book-author-personal', title: 'Author Personal Book' };
         mockAudioBookService.createAudioBook.mockResolvedValue(mockBook as any);
         (MessageHandler.getSuccessMessage as jest.Mock).mockReturnValue('Created');

         await audioBookController.createAudioBook(mockReq, mockRes, mockReq.next);
         await flushPromises();

         expect(mockContentAuthorizationService.canCreateAudiobook).toHaveBeenCalledWith(
            'auth-author-1',
            { type: 'AUTHOR', id: 'author-1' },
            AuthRole.AUTHOR,
            'test-token',
         );
         expect(mockAudioBookService.createAudioBook).toHaveBeenCalledWith(
            expect.objectContaining({ owner: { type: 'AUTHOR', id: 'author-1' } }),
            'auth-author-1',
            'test-token',
            '/uploads/covers/cover.jpg',
         );
      });

      it('should create audiobook for author linked to organization', async () => {
         mockReq.user = { id: 'auth-author-1', role: AuthRole.AUTHOR };
         mockContentAuthorizationService.canCreateAudiobook.mockResolvedValue(true);
         mockReq.body = {
            title: 'Author Book',
            author: 'Author Name',
            owner: JSON.stringify({ type: 'ORGANIZATION', id: 'org-1' }),
         };
         (mockReq as any).coverImageFile = mockCoverImageFile;

         const mockBook = { id: 'book-author', title: 'Author Book' };
         mockAudioBookService.createAudioBook.mockResolvedValue(mockBook as any);
         (MessageHandler.getSuccessMessage as jest.Mock).mockReturnValue('Created');

         await audioBookController.createAudioBook(mockReq, mockRes, mockReq.next);
         await flushPromises();

         expect(mockContentAuthorizationService.canCreateAudiobook).toHaveBeenCalledWith(
            'auth-author-1',
            { type: 'ORGANIZATION', id: 'org-1' },
            AuthRole.AUTHOR,
            'test-token',
         );
         expect(mockAudioBookService.createAudioBook).toHaveBeenCalled();
      });

      it('should return forbidden when author is not linked to organization', async () => {
         mockReq.user = { id: 'auth-author-1', role: AuthRole.AUTHOR };
         mockContentAuthorizationService.canCreateAudiobook.mockResolvedValue(false);
         mockReq.body = {
            title: 'Author Book',
            author: 'Author Name',
            owner: JSON.stringify({ type: 'ORGANIZATION', id: 'org-1' }),
         };
         (mockReq as any).coverImageFile = mockCoverImageFile;
         (MessageHandler.getErrorMessage as jest.Mock).mockReturnValue('Org admin required');

         await audioBookController.createAudioBook(mockReq, mockRes, mockReq.next);
         await flushPromises();

         expect(ResponseHandler.forbidden).toHaveBeenCalledWith(mockRes, 'Org admin required');
         expect(mockAudioBookService.createAudioBook).not.toHaveBeenCalled();
      });
   });

   describe('deleteAudioBook', () => {
      it('should delete audiobook and return no content', async () => {
         mockReq.params.id = 'book-123';
         mockAudioBookService.deleteAudioBook.mockResolvedValue(undefined);

         await audioBookController.deleteAudioBook(mockReq, mockRes, mockReq.next);
         await flushPromises();

         expect(mockContentAuthorizationService.canManageAudiobook).toHaveBeenCalledWith(
            'auth-user-1',
            'book-123',
            AuthRole.AUTHOR,
            'test-token',
         );
         expect(mockAudioBookService.deleteAudioBook).toHaveBeenCalledWith('book-123');
         expect(ResponseHandler.noContent).toHaveBeenCalledWith(mockRes);
      });
   });

   describe('searchAudioBooks', () => {
      it('should search audiobooks with query', async () => {
         mockReq.query = { q: 'test search' };

         mockAudioBookService.getAllAudioBooks.mockResolvedValue({
            audiobooks: [],
            totalCount: 0
         });
         (ResponseHandler.calculatePagination as jest.Mock).mockReturnValue({});
         (MessageHandler.getSuccessMessage as jest.Mock).mockReturnValue('Search results');

         await audioBookController.searchAudioBooks(mockReq, mockRes, mockReq.next);

         expect(mockAudioBookService.getAllAudioBooks).toHaveBeenCalledWith(
            expect.objectContaining({ search: 'test search' }),
            'test-token',
         );
      });

      it('should return validation error if query is empty', async () => {
         mockReq.query = { q: '' };
         (MessageHandler.getErrorMessage as jest.Mock).mockReturnValue('Search required');

         await audioBookController.searchAudioBooks(mockReq, mockRes, mockReq.next);

         expect(ResponseHandler.validationError).toHaveBeenCalledWith(
            mockRes,
            'Search required'
         );
         expect(mockAudioBookService.getAllAudioBooks).not.toHaveBeenCalled();
      });
   });

   describe('getAudioBooksByGenre', () => {
      it('should filter audiobooks by genre', async () => {
         mockReq.params.genre = 'genre-123';
         mockReq.query = { page: '1', limit: '10' };

         mockAudioBookService.getAllAudioBooks.mockResolvedValue({
            audiobooks: [],
            totalCount: 0
         });
         (ResponseHandler.calculatePagination as jest.Mock).mockReturnValue({});
         (MessageHandler.getSuccessMessage as jest.Mock).mockReturnValue('Filtered');

         await audioBookController.getAudioBooksByGenre(mockReq, mockRes, mockReq.next);

         expect(mockAudioBookService.getAllAudioBooks).toHaveBeenCalledWith(
            expect.objectContaining({ genreIds: ['genre-123'] }),
            'test-token',
         );
      });
   });

   describe('getAudioBooksByAuthor', () => {
      it('should filter audiobooks by author', async () => {
         mockReq.params.author = 'Author%20Name';
         mockReq.query = { page: '1', limit: '10' };

         mockAudioBookService.getAllAudioBooks.mockResolvedValue({
            audiobooks: [],
            totalCount: 0
         });
         (ResponseHandler.calculatePagination as jest.Mock).mockReturnValue({});
         (MessageHandler.getSuccessMessage as jest.Mock).mockReturnValue('Filtered');

         await audioBookController.getAudioBooksByAuthor(mockReq, mockRes, mockReq.next);

         expect(mockAudioBookService.getAllAudioBooks).toHaveBeenCalledWith(
            expect.objectContaining({ author: 'Author Name' }),
            'test-token',
         );
      });
   });

   describe('error handling', () => {
      it('should propagate service errors', async () => {
         mockReq.params.id = 'book-123';
         const error = new ApiError('Book not found', HttpStatusCode.NOT_FOUND);
         mockAudioBookService.getAudioBookById.mockRejectedValue(error);

         try {
            await audioBookController.getAudioBookById(mockReq, mockRes, mockReq.next);
         } catch (e) {
            expect(e).toEqual(error);
         }
      });
   });
});

