/**
 * ChapterController createChapter authorization tests
 */

import { PrismaClient } from '@prisma/client';
import { ChapterController } from '../../controllers/ChapterController';
import { ChapterService } from '../../services/ChapterService';
import { ResponseHandler } from '../../utils/ResponseHandler';
import { MessageHandler } from '../../utils/MessageHandler';
import { AuthRole } from '../../constants/authRoles';

jest.mock('../../services/ChapterService');
jest.mock('../../utils/ResponseHandler');
jest.mock('../../utils/MessageHandler');

const flushPromises = (): Promise<void> =>
   new Promise<void>((resolve) => setImmediate(resolve));

describe('ChapterController.createChapter', () => {
   let chapterController: ChapterController;
   let mockPrisma: PrismaClient;
   let mockReq: any;
   let mockRes: any;
   let mockChapterService: jest.Mocked<ChapterService>;
   let mockContentAuthorizationService: { canCreateChapter: jest.Mock };

   const mockCoverImageFile = { path: '/uploads/covers/chapter-cover.jpg' };
   const mockAudioFile = { path: '/uploads/chapters/chapter-audio.mp3', size: 1024 };

   beforeEach(() => {
      mockPrisma = {
         userProfile: {
            findUnique: jest.fn().mockResolvedValue({ id: 'profile-1' }),
         },
         audioBook: {
            findUnique: jest.fn().mockResolvedValue({ type: 'PUBLICATION' }),
         },
      } as unknown as PrismaClient;

      mockReq = {
         params: {},
         query: {},
         body: {
            audiobookId: 'audiobook-1',
            title: 'Chapter 1',
            chapterNumber: '1',
            duration: '1200',
            startPosition: '0',
            endPosition: '1200',
         },
         headers: { authorization: 'Bearer test-token' },
         originalUrl: '/api/v1/chapters',
         user: { id: 'auth-author-1', role: AuthRole.AUTHOR },
      } as any;

      mockRes = {
         status: jest.fn().mockReturnThis(),
         json: jest.fn().mockReturnThis(),
         send: jest.fn().mockReturnThis(),
      } as any;

      mockReq.next = jest.fn();
      jest.clearAllMocks();

      chapterController = new ChapterController(mockPrisma);
      mockChapterService = (chapterController as any).chapterService;
      mockContentAuthorizationService = (chapterController as any).contentAuthorizationService;
      mockContentAuthorizationService.canCreateChapter = jest.fn().mockResolvedValue({
         audiobookExists: true,
         allowed: true,
      });

      (mockReq as any).coverImageFile = mockCoverImageFile;
      (mockReq as any).audioFile = mockAudioFile;
   });

   it('should create chapter for author linked to organization', async () => {
      const mockChapter = { id: 'chapter-1', title: 'Chapter 1' };
      mockChapterService.createChapter.mockResolvedValue(mockChapter as any);
      (MessageHandler.getSuccessMessage as jest.Mock).mockReturnValue('Chapter created');

      await chapterController.createChapter(mockReq, mockRes, mockReq.next);
      await flushPromises();

      expect(mockContentAuthorizationService.canCreateChapter).toHaveBeenCalledWith(
         'auth-author-1',
         'audiobook-1',
         AuthRole.AUTHOR,
         'test-token',
      );
      expect(mockChapterService.createChapter).toHaveBeenCalled();
      expect(ResponseHandler.success).toHaveBeenCalledWith(
         mockRes,
         mockChapter,
         'Chapter created',
         201,
      );
   });

   it('should return forbidden when author is not linked to organization', async () => {
      mockContentAuthorizationService.canCreateChapter.mockResolvedValue({
         audiobookExists: true,
         allowed: false,
      });
      (MessageHandler.getErrorMessage as jest.Mock).mockReturnValue('Org admin required');

      await chapterController.createChapter(mockReq, mockRes, mockReq.next);
      await flushPromises();

      expect(ResponseHandler.forbidden).toHaveBeenCalledWith(mockRes, 'Org admin required');
      expect(mockChapterService.createChapter).not.toHaveBeenCalled();
   });

   it('should return not found when audiobook does not exist', async () => {
      mockContentAuthorizationService.canCreateChapter.mockResolvedValue({
         audiobookExists: false,
         allowed: false,
      });
      (MessageHandler.getErrorMessage as jest.Mock).mockReturnValue('Audiobook not found');

      await chapterController.createChapter(mockReq, mockRes, mockReq.next);
      await flushPromises();

      expect(ResponseHandler.notFound).toHaveBeenCalledWith(mockRes, 'Audiobook not found');
      expect(mockChapterService.createChapter).not.toHaveBeenCalled();
   });

   it('should create chapter for author-owned audiobook', async () => {
      mockContentAuthorizationService.canCreateChapter.mockResolvedValue({
         audiobookExists: true,
         allowed: true,
      });
      const mockChapter = { id: 'chapter-1', title: 'Chapter 1' };
      mockChapterService.createChapter.mockResolvedValue(mockChapter as any);
      (MessageHandler.getSuccessMessage as jest.Mock).mockReturnValue('Chapter created');

      await chapterController.createChapter(mockReq, mockRes, mockReq.next);
      await flushPromises();

      expect(mockChapterService.createChapter).toHaveBeenCalled();
      expect(ResponseHandler.success).toHaveBeenCalledWith(
         mockRes,
         mockChapter,
         'Chapter created',
         201,
      );
   });

   it('should return validation error when cover image is missing', async () => {
      (mockReq as any).coverImageFile = undefined;

      await chapterController.createChapter(mockReq, mockRes, mockReq.next);
      await flushPromises();

      expect(ResponseHandler.validationError).toHaveBeenCalledWith(mockRes, 'Cover image is required');
      expect(mockContentAuthorizationService.canCreateChapter).not.toHaveBeenCalled();
      expect(mockChapterService.createChapter).not.toHaveBeenCalled();
   });
});
