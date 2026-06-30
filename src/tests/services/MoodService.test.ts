/**
 * MoodService Tests
 */
import { MoodService } from '../../services/MoodService';
import { AudioBookService } from '../../services/AudioBookService';
import { ApiError } from '../../types/ApiError';

const mockPrisma = {
   mood: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
   },
   moodAttribute: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
   },
   $transaction: jest.fn(),
} as any;

jest.mock('../../utils/MessageHandler', () => ({
   MessageHandler: {
      getErrorMessage: (key: string) => key,
   },
}));

describe('MoodService', () => {
   let moodService: MoodService;
   let mockAudioBookService: jest.Mocked<Pick<AudioBookService, 'getAudioBooksByMoodId'>>;

   beforeEach(() => {
      mockAudioBookService = {
         getAudioBooksByMoodId: jest.fn().mockResolvedValue([]),
      };
      moodService = new MoodService(mockPrisma, mockAudioBookService as unknown as AudioBookService);
      jest.clearAllMocks();
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) =>
         fn(mockPrisma),
      );
   });

   describe('createMood', () => {
      it('creates a mood when name is unique and hexcode is valid', async () => {
         mockPrisma.mood.findFirst.mockResolvedValue(null);
         mockPrisma.mood.create.mockResolvedValue({
            id: 'm1',
            name: 'Calm',
            description: 'Relaxing',
            purpose: '',
            descriptionIcon: 'text',
            hexcode: '#AABBCC',
            icon: 'wave',
            moodAttributes: [],
            createdAt: new Date(),
            updatedAt: new Date(),
         });

         const result = await moodService.createMood({
            name: 'Calm',
            description: 'Relaxing',
            descriptionIcon: 'text',
            hexcode: '#AABBCC',
            icon: 'wave',
            attributes: [{ icon: 'sparkle', description: 'Soothing tone' }],
         });

         expect(result.name).toBe('Calm');
         expect(mockPrisma.mood.create).toHaveBeenCalledWith({
            data: {
               name: 'Calm',
               description: 'Relaxing',
               descriptionIcon: 'text',
               hexcode: '#AABBCC',
               icon: 'wave',
               moodAttributes: {
                  create: [{ icon: 'sparkle', description: 'Soothing tone' }],
               },
            },
         });
         expect(result).not.toHaveProperty('attributes');
      });

      it('throws on duplicate name', async () => {
         mockPrisma.mood.findFirst.mockResolvedValue({ id: 'm1', name: 'Calm' });
         await expect(
            moodService.createMood({
               name: 'Calm',
               descriptionIcon: 'text',
               hexcode: '#AABBCC',
               icon: 'wave',
            })
         ).rejects.toBeInstanceOf(ApiError);
      });

      it('throws on invalid hexcode', async () => {
         await expect(
            moodService.createMood({
               name: 'Calm',
               descriptionIcon: 'text',
               hexcode: 'invalid',
               icon: 'wave',
            })
         ).rejects.toBeInstanceOf(ApiError);
         expect(mockPrisma.mood.create).not.toHaveBeenCalled();
      });
   });

   describe('getAllMoods', () => {
      it('returns all moods sorted by name', async () => {
         mockPrisma.mood.findMany.mockResolvedValue([
            {
               id: '1',
               name: 'Calm',
               description: null,
               purpose: '',
               descriptionIcon: 'text',
               hexcode: '#111111',
               icon: 'wave',
               createdAt: new Date(),
               updatedAt: new Date(),
            },
         ]);

         const result = await moodService.getAllMoods();
         expect(result).toHaveLength(1);
         expect(result[0]).not.toHaveProperty('attributes');
         expect(result[0]).not.toHaveProperty('purpose');
         expect(mockPrisma.mood.findMany).toHaveBeenCalledWith({
            orderBy: { name: 'asc' },
         });
      });
   });

   describe('getMoodById', () => {
      it('returns mood with purpose and attributes when found', async () => {
         mockPrisma.mood.findUnique.mockResolvedValue({
            id: 'm1',
            name: 'Calm',
            description: null,
            purpose: 'Calm is designed for slowing down, breathing deeply, and finding peace.',
            descriptionIcon: 'text',
            hexcode: '#111111',
            icon: 'wave',
            moodAttributes: [{ id: 'a1', moodId: 'm1', icon: 'soft', description: 'Gentle', createdAt: new Date(), updatedAt: new Date() }],
            createdAt: new Date(),
            updatedAt: new Date(),
         });

         const result = await moodService.getMoodById('m1');
         expect(result.id).toBe('m1');
         expect(result.purpose).toBe('Calm is designed for slowing down, breathing deeply, and finding peace.');
         expect(result.attributes).toHaveLength(1);
         expect(result.audiobooks).toEqual([]);
         expect(mockAudioBookService.getAudioBooksByMoodId).toHaveBeenCalledWith('m1', undefined, false);
         expect(mockPrisma.mood.findUnique).toHaveBeenCalledWith({
            where: { id: 'm1' },
            include: {
               moodAttributes: {
                  orderBy: { createdAt: 'asc' },
               },
            },
         });
      });

      it('throws when mood not found', async () => {
         mockPrisma.mood.findUnique.mockResolvedValue(null);
         await expect(moodService.getMoodById('missing')).rejects.toBeInstanceOf(ApiError);
         expect(mockAudioBookService.getAudioBooksByMoodId).not.toHaveBeenCalled();
      });

      it('returns associated audiobooks from AudioBookService', async () => {
         mockPrisma.mood.findUnique.mockResolvedValue({
            id: 'm1',
            name: 'Calm',
            description: null,
            purpose: 'Calm purpose',
            descriptionIcon: 'text',
            hexcode: '#111111',
            icon: 'wave',
            moodAttributes: [],
            createdAt: new Date(),
            updatedAt: new Date(),
         });
         const audiobooks = [
            {
               id: 'ab1',
               title: 'Book One',
               author: 'Author',
               languageId: 'lang-en',
               isActive: true,
               isPublic: true,
               subscriptionGatingMode: 'NONE' as const,
               createdAt: new Date(),
               updatedAt: new Date(),
               owner: { type: 'AUTHOR' as const, id: 'author-1' },
            },
         ];
         mockAudioBookService.getAudioBooksByMoodId.mockResolvedValue(audiobooks);

         const result = await moodService.getMoodById('m1', 'token-123');

         expect(result.audiobooks).toEqual(audiobooks);
         expect(mockAudioBookService.getAudioBooksByMoodId).toHaveBeenCalledWith('m1', 'token-123', false);
      });
   });

   describe('updateMood', () => {
      it('updates mood fields and replaces attributes', async () => {
         mockPrisma.mood.findUnique.mockResolvedValue({ id: 'm1', name: 'Calm' });
         mockPrisma.mood.findFirst.mockResolvedValue(null);
         mockPrisma.mood.update.mockResolvedValue({
            id: 'm1',
            name: 'Peaceful',
            description: null,
            purpose: '',
            descriptionIcon: 'text',
            hexcode: '#222222',
            icon: 'wave',
            createdAt: new Date(),
            updatedAt: new Date(),
         });

         const result = await moodService.updateMood('m1', {
            name: 'Peaceful',
            hexcode: '#222222',
            attributes: [{ icon: 'sparkle', description: 'Gentle' }],
         });

         expect(result.name).toBe('Peaceful');
         expect(result).not.toHaveProperty('attributes');
         expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
         expect(mockPrisma.moodAttribute.deleteMany).toHaveBeenCalledWith({ where: { moodId: 'm1' } });
         expect(mockPrisma.moodAttribute.createMany).toHaveBeenCalledWith({
            data: [{ moodId: 'm1', icon: 'sparkle', description: 'Gentle' }],
         });
      });

      it('throws when mood not found', async () => {
         mockPrisma.mood.findUnique.mockResolvedValue(null);
         await expect(moodService.updateMood('missing', { name: 'X' })).rejects.toBeInstanceOf(ApiError);
      });
   });

   describe('deleteMood', () => {
      it('deletes existing mood', async () => {
         mockPrisma.mood.findUnique.mockResolvedValue({ id: 'm1' });
         mockPrisma.mood.delete.mockResolvedValue({ id: 'm1' });

         const result = await moodService.deleteMood('m1');
         expect(result).toBe(true);
         expect(mockPrisma.mood.delete).toHaveBeenCalledWith({ where: { id: 'm1' } });
      });

      it('throws when mood not found', async () => {
         mockPrisma.mood.findUnique.mockResolvedValue(null);
         await expect(moodService.deleteMood('missing')).rejects.toBeInstanceOf(ApiError);
      });
   });
});
