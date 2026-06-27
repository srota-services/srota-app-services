/**
 * MoodController Tests
 */
import { PrismaClient } from '@prisma/client';
import { MoodController } from '../../controllers/MoodController';
import { MoodService } from '../../services/MoodService';
import { ResponseHandler } from '../../utils/ResponseHandler';
import { MessageHandler } from '../../utils/MessageHandler';

jest.mock('../../services/MoodService');
jest.mock('../../utils/ResponseHandler');
jest.mock('../../utils/MessageHandler');

const flushPromises = (): Promise<void> =>
   new Promise<void>((resolve) => setImmediate(resolve));

describe('MoodController', () => {
   let moodController: MoodController;
   let mockPrisma: PrismaClient;
   let mockReq: any;
   let mockRes: any;
   let mockMoodService: jest.Mocked<MoodService>;
   let mockNext: jest.Mock;

   beforeEach(() => {
      mockPrisma = {} as PrismaClient;
      mockReq = { params: {}, query: {}, body: {}, headers: {}, originalUrl: '/api/v1/moods' };
      mockRes = {
         status: jest.fn().mockReturnThis(),
         json: jest.fn().mockReturnThis(),
         send: jest.fn().mockReturnThis(),
      };
      mockNext = jest.fn();
      (MessageHandler.getSuccessMessage as jest.Mock).mockImplementation((k: string) => k);
      jest.clearAllMocks();
      moodController = new MoodController(mockPrisma);
      mockMoodService = (moodController as any).moodService;
   });

   describe('getAllMoods', () => {
      it('retrieves all moods and sends success response', async () => {
         const mockMoods = [
            {
               id: 'm1',
               name: 'Calm',
               description: null,
               descriptionIcon: 'text',
               hexcode: '#111111',
               icon: 'wave',
               createdAt: new Date(),
               updatedAt: new Date(),
            },
         ];
         mockMoodService.getAllMoods.mockResolvedValue(mockMoods);

         await moodController.getAllMoods(mockReq, mockRes, mockNext);
         await flushPromises();

         expect(mockMoodService.getAllMoods).toHaveBeenCalledTimes(1);
         expect(ResponseHandler.success).toHaveBeenCalledWith(mockRes, mockMoods, 'moods.retrieved');
      });
   });

   describe('createMood', () => {
      it('creates mood and returns 201', async () => {
         const payload = {
            name: 'Calm',
            description: 'Relaxing',
            descriptionIcon: 'text',
            hexcode: '#AABBCC',
            icon: 'wave',
            attributes: [{ icon: 'sparkle', description: 'Soothing tone' }],
         };
         const created = {
            id: 'm1',
            name: payload.name,
            description: payload.description,
            descriptionIcon: payload.descriptionIcon,
            hexcode: payload.hexcode,
            icon: payload.icon,
            createdAt: new Date(),
            updatedAt: new Date(),
         };
         mockReq.body = payload;
         mockMoodService.createMood.mockResolvedValue(created);

         await moodController.createMood(mockReq, mockRes, mockNext);
         await flushPromises();

         expect(mockMoodService.createMood).toHaveBeenCalledWith(payload);
         expect(ResponseHandler.success).toHaveBeenCalledWith(mockRes, created, 'moods.created', 201);
      });
   });

   describe('getMoodById', () => {
      it('retrieves mood by id', async () => {
         mockReq.params = { id: 'm1' };
         const mood = {
            id: 'm1',
            name: 'Calm',
            description: null,
            purpose: 'Calm is designed for slowing down, breathing deeply, and finding peace.',
            descriptionIcon: 'text',
            hexcode: '#111111',
            icon: 'wave',
            attributes: [],
            audiobooks: [],
            createdAt: new Date(),
            updatedAt: new Date(),
         };
         mockMoodService.getMoodById.mockResolvedValue(mood);

         await moodController.getMoodById(mockReq, mockRes, mockNext);
         await flushPromises();

         expect(mockMoodService.getMoodById).toHaveBeenCalledWith('m1', undefined, false);
         expect(ResponseHandler.success).toHaveBeenCalledWith(mockRes, mood, 'moods.retrieved');
      });
   });

   describe('updateMood', () => {
      it('updates mood by id', async () => {
         mockReq.params = { id: 'm1' };
         mockReq.body = { name: 'Peaceful' };
         const updated = {
            id: 'm1',
            name: 'Peaceful',
            description: null,
            descriptionIcon: 'text',
            hexcode: '#111111',
            icon: 'wave',
            createdAt: new Date(),
            updatedAt: new Date(),
         };
         mockMoodService.updateMood.mockResolvedValue(updated);

         await moodController.updateMood(mockReq, mockRes, mockNext);
         await flushPromises();

         expect(mockMoodService.updateMood).toHaveBeenCalledWith('m1', { name: 'Peaceful' });
         expect(ResponseHandler.success).toHaveBeenCalledWith(mockRes, updated, 'moods.updated');
      });
   });

   describe('deleteMood', () => {
      it('deletes mood by id', async () => {
         mockReq.params = { id: 'm1' };
         mockMoodService.deleteMood.mockResolvedValue(true);

         await moodController.deleteMood(mockReq, mockRes, mockNext);
         await flushPromises();

         expect(mockMoodService.deleteMood).toHaveBeenCalledWith('m1');
         expect(ResponseHandler.success).toHaveBeenCalledWith(mockRes, { deleted: true }, 'moods.deleted');
      });
   });
});
