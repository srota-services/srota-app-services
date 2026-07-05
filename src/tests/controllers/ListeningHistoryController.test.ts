/**
 * ListeningHistoryController Tests
 */
import { PrismaClient } from '@prisma/client';
import { ListeningHistoryController } from '../../controllers/ListeningHistoryController';
import { ListeningHistoryService } from '../../services/ListeningHistoryService';
import { ResponseHandler } from '../../utils/ResponseHandler';
import { MessageHandler } from '../../utils/MessageHandler';

jest.mock('../../services/ListeningHistoryService');
jest.mock('../../utils/ResponseHandler');
jest.mock('../../utils/MessageHandler');

describe('ListeningHistoryController', () => {
   let controller: ListeningHistoryController;
   let mockService: jest.Mocked<ListeningHistoryService>;
   let mockReq: any;
   let mockRes: any;
   let mockNext: jest.Mock;

   beforeEach(() => {
      mockReq = { params: {}, query: {}, originalUrl: '/api/v1/listening-history' };
      mockRes = {
         status: jest.fn().mockReturnThis(),
         json: jest.fn().mockReturnThis(),
      };
      mockNext = jest.fn();
      jest.clearAllMocks();
      (MessageHandler.getSuccessMessage as jest.Mock).mockReturnValue('Retrieved');

      controller = new ListeningHistoryController({} as PrismaClient);
      mockService = (controller as any).listeningHistoryService;
   });

   describe('getListeningHistoryByUserId', () => {
      it('returns paginated listening history', async () => {
         const now = new Date();
         const mockHistory = [
            {
               id: 'lh1',
               userId: 'user1',
               audiobookId: 'book1',
               currentPosition: 120,
               completed: false,
               lastListenedAt: now,
               createdAt: now,
               updatedAt: now,
               audiobook: {
                  id: 'book1',
                  title: 'Book',
                  author: 'Author',
                  narrator: null,
                  coverImage: null,
                  duration: 1000,
               },
            },
         ];

         mockReq.params = { userId: 'user1' };
         mockService.getListeningHistoryByUserId.mockResolvedValue({
            listeningHistory: mockHistory as any,
            totalCount: 1,
         });

         await controller.getListeningHistoryByUserId(mockReq, mockRes, mockNext);

         expect(mockService.getListeningHistoryByUserId).toHaveBeenCalledWith(
            'user1',
            expect.objectContaining({
               page: 1,
               limit: 20,
               sortBy: 'lastListenedAt',
               sortOrder: 'desc',
            })
         );
         expect(ResponseHandler.paginated).toHaveBeenCalled();
      });
   });
});
