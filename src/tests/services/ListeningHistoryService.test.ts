/**
 * ListeningHistoryService Tests
 */
import { ListeningHistoryService } from '../../services/ListeningHistoryService';

const mockPrisma = {
   listeningHistory: {
      findMany: jest.fn(),
      count: jest.fn(),
   },
} as any;

jest.mock('../../services/FileUrlService', () => ({
   fileUrlService: {
      resolveNestedAudiobookMedia: jest.fn(async (audiobook: { coverImage?: string | null }) => ({
         coverImage: audiobook.coverImage,
         imageAssets: {},
      })),
   },
}));

describe('ListeningHistoryService', () => {
   let service: ListeningHistoryService;

   beforeEach(() => {
      service = new ListeningHistoryService(mockPrisma);
      jest.clearAllMocks();
   });

   describe('getListeningHistoryByUserId', () => {
      it('returns paginated listening history with audiobook details', async () => {
         const now = new Date();
         mockPrisma.listeningHistory.findMany.mockResolvedValue([
            {
               id: 'lh1',
               userId: 'user-1',
               audiobookId: 'book1',
               currentPosition: 900,
               completed: false,
               lastListenedAt: now,
               createdAt: now,
               updatedAt: now,
               audiobook: {
                  id: 'book1',
                  title: 'Test Book',
                  author: 'Author',
                  narrator: null,
                  coverImage: 'cover.jpg',
                  duration: 3600,
               },
            },
         ]);
         mockPrisma.listeningHistory.count.mockResolvedValue(1);

         const result = await service.getListeningHistoryByUserId('user-1', {
            page: 1,
            limit: 10,
         });

         expect(result.listeningHistory).toHaveLength(1);
         expect(result.listeningHistory[0]?.currentPosition).toBe(900);
         expect(result.listeningHistory[0]?.audiobook.title).toBe('Test Book');
         expect(result.totalCount).toBe(1);
         expect(mockPrisma.listeningHistory.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
               where: { userId: 'user-1' },
            })
         );
      });

      it('filters by audiobookId and completed', async () => {
         mockPrisma.listeningHistory.findMany.mockResolvedValue([]);
         mockPrisma.listeningHistory.count.mockResolvedValue(0);

         await service.getListeningHistoryByUserId('user-1', {
            audiobookId: 'book1',
            completed: true,
            page: 1,
            limit: 20,
         });

         expect(mockPrisma.listeningHistory.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
               where: {
                  userId: 'user-1',
                  audiobookId: 'book1',
                  completed: true,
               },
            })
         );
      });
   });
});
