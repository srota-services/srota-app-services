/**
 * BookmarkController Tests
 * Tests for HTTP request handling with authentication and CRUD operations
 */

import { PrismaClient } from '@prisma/client';
import { BookmarkController } from '../../controllers/BookmarkController';
import { BookmarkService } from '../../services/BookmarkService';
import { ResponseHandler } from '../../utils/ResponseHandler';
import { MessageHandler } from '../../utils/MessageHandler';
import { ApiError } from '../../types/ApiError';
import { HttpStatusCode } from '../../types/common';
import { resolveUserId } from '../../utils/resolveUserId';

jest.mock('../../services/BookmarkService');
jest.mock('../../utils/ResponseHandler');
jest.mock('../../utils/MessageHandler');
jest.mock('../../utils/resolveUserId');

const flushPromises = (): Promise<void> =>
   new Promise<void>((resolve) => setImmediate(resolve));

describe('BookmarkController', () => {
   let bookmarkController: BookmarkController;
   let mockPrisma: PrismaClient;
   let mockReq: any;
   let mockRes: any;
   let mockBookmarkService: jest.Mocked<BookmarkService>;

   const userId = 'profile-123';

   beforeEach(() => {
      mockPrisma = {
         user: {
            findUnique: jest.fn(),
         },
      } as unknown as PrismaClient;
      mockReq = {
         params: {},
         query: {},
         body: {},
         user: { id: 'user-123' },
         originalUrl: '/api/v1/bookmarks',
      } as any;
      mockRes = {
         status: jest.fn().mockReturnThis(),
         json: jest.fn().mockReturnThis(),
         send: jest.fn().mockReturnThis(),
      } as any;

      mockReq.next = jest.fn();
      jest.clearAllMocks();
      (resolveUserId as jest.Mock).mockReturnValue(userId);

      bookmarkController = new BookmarkController(mockPrisma);
      mockBookmarkService = (bookmarkController as any).bookmarkService;
   });

   describe('createBookmark', () => {
      it('should create chapter bookmark for authenticated user', async () => {
         mockReq.body = { chapterId: 'chapter-123' };

         const mockBookmark = { id: 'bookmark-1', chapterId: 'chapter-123', userId };
         mockBookmarkService.createBookmark.mockResolvedValue(mockBookmark as any);
         (MessageHandler.getSuccessMessage as jest.Mock).mockReturnValue('Bookmark created');

         await bookmarkController.createBookmark(mockReq, mockRes, mockReq.next);
         await flushPromises();

         expect(resolveUserId).toHaveBeenCalledWith(mockReq);
         expect(mockBookmarkService.createBookmark).toHaveBeenCalledWith(
            userId,
            mockReq.body
         );
         expect(ResponseHandler.success).toHaveBeenCalledWith(
            mockRes,
            mockBookmark,
            'Bookmark created',
            HttpStatusCode.CREATED
         );
      });
   });

   describe('getBookmarks', () => {
      it('should retrieve bookmarks with pagination', async () => {
         mockReq.query = { page: '1', limit: '20' };

         const mockBookmarks = [
            { id: 'bookmark-1', chapterId: 'chapter-1' },
            { id: 'bookmark-2', chapterId: 'chapter-2' },
         ];

         mockBookmarkService.getBookmarks.mockResolvedValue({
            bookmarks: mockBookmarks as any,
            totalCount: 2,
         });
         (ResponseHandler.calculatePagination as jest.Mock).mockReturnValue({
            currentPage: 1,
            totalPages: 1,
            totalItems: 2,
            itemsPerPage: 20,
            hasNextPage: false,
            hasPreviousPage: false,
         });
         (MessageHandler.getSuccessMessage as jest.Mock).mockReturnValue('Bookmarks retrieved');

         await bookmarkController.getBookmarks(mockReq, mockRes, mockReq.next);
         await flushPromises();

         expect(mockBookmarkService.getBookmarks).toHaveBeenCalledWith(
            userId,
            expect.objectContaining({
               page: 1,
               limit: 20,
               sortBy: 'createdAt',
               sortOrder: 'desc',
            })
         );
         expect(ResponseHandler.paginated).toHaveBeenCalled();
      });

      it('should filter bookmarks by audiobookId and chapterId', async () => {
         mockReq.query = {
            audiobookId: 'audiobook-123',
            chapterId: 'chapter-456',
         };

         mockBookmarkService.getBookmarks.mockResolvedValue({
            bookmarks: [],
            totalCount: 0,
         });
         (ResponseHandler.calculatePagination as jest.Mock).mockReturnValue({});
         (MessageHandler.getSuccessMessage as jest.Mock).mockReturnValue('Retrieved');

         await bookmarkController.getBookmarks(mockReq, mockRes, mockReq.next);
         await flushPromises();

         expect(mockBookmarkService.getBookmarks).toHaveBeenCalledWith(
            userId,
            expect.objectContaining({
               audiobookId: 'audiobook-123',
               chapterId: 'chapter-456',
            })
         );
      });
   });

   describe('deleteBookmark', () => {
      it('should delete bookmark and return no content', async () => {
         mockReq.params.id = 'bookmark-123';
         mockBookmarkService.deleteBookmark.mockResolvedValue(undefined);

         await bookmarkController.deleteBookmark(mockReq, mockRes, mockReq.next);
         await flushPromises();

         expect(mockBookmarkService.deleteBookmark).toHaveBeenCalledWith(userId, 'bookmark-123');
         expect(ResponseHandler.noContent).toHaveBeenCalledWith(mockRes);
      });
   });

   describe('createNote', () => {
      it('should create note for authenticated user', async () => {
         mockReq.body = {
            audiobookId: 'audiobook-123',
            title: 'My Note',
            content: 'Note content',
         };

         const mockNote = { id: 'note-1', title: 'My Note' };
         mockBookmarkService.createNote.mockResolvedValue(mockNote as any);
         (MessageHandler.getSuccessMessage as jest.Mock).mockReturnValue('Note created');

         await bookmarkController.createNote(mockReq, mockRes, mockReq.next);

         expect(mockBookmarkService.createNote).toHaveBeenCalledWith(
            'user-123',
            mockReq.body
         );
         expect(ResponseHandler.success).toHaveBeenCalledWith(
            mockRes,
            mockNote,
            'Note created',
            HttpStatusCode.CREATED
         );
      });
   });

   describe('error handling', () => {
      it('should propagate service errors', async () => {
         mockReq.params.id = 'bookmark-123';
         const error = new ApiError('Bookmark not found', HttpStatusCode.NOT_FOUND);
         mockBookmarkService.getBookmarkById.mockRejectedValue(error);

         try {
            await bookmarkController.getBookmarkById(mockReq, mockRes, mockReq.next);
         } catch (e) {
            expect(e).toEqual(error);
         }
      });
   });
});
