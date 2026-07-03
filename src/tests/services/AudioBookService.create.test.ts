import { PrismaClient } from '@prisma/client';
import { AudioBookService } from '../../services/AudioBookService';
import { ApiError } from '../../types/ApiError';
import { ImageAssetService } from '../../services/ImageAssetService';

jest.mock('../../services/ImageAssetService');
jest.mock('../../services/FileUrlService', () => ({
   fileUrlService: {
      resolveAudioBookMedia: jest.fn(async (audiobook: Record<string, unknown>) => audiobook),
   },
}));
jest.mock('../../services/DomainEventPublisher', () => ({
   emitCacheInvalidation: jest.fn(),
}));
jest.mock('../../services/AudioBookOwnerService', () => ({
   AudioBookOwnerService: jest.fn().mockImplementation(() => ({
      attachOwnerDetail: jest.fn(async (dto: Record<string, unknown>) => dto),
   })),
}));

describe('AudioBookService.createAudioBook validation and persistence', () => {
   const mockCreate = jest.fn();
   const mockGenreCreateMany = jest.fn();
   const mockTagCreateMany = jest.fn();
   const mockDeleteManyGenres = jest.fn();
   const mockDeleteManyTags = jest.fn();
   const mockDeleteAudiobook = jest.fn();
   const mockFindUnique = jest.fn();
   const mockGenreFindMany = jest.fn();
   const mockTagFindMany = jest.fn();
   const mockMoodFindUnique = jest.fn();
   const mockLanguageFindUnique = jest.fn();
   const mockValidateUploadSource = jest.fn();
   const mockGenerateAndStoreVariants = jest.fn();
   const mockTransaction = jest.fn();
   let service: AudioBookService;

   const baseCreateData = {
      title: 'Test Audiobook',
      author: 'Test Author',
      owner: { type: 'AUTHOR' as const, id: 'author-1' },
      type: 'PUBLICATION' as const,
      genreIds: ['genre-1'],
   };

   const createdAudiobook = {
      id: 'audiobook-1',
      title: baseCreateData.title,
      author: baseCreateData.author,
      type: 'PUBLICATION',
      ownerType: 'AUTHOR',
      ownerId: 'author-1',
      languageId: 'lang-bn',
      language: {
         id: 'lang-bn',
         name: 'Bengali',
         code: 'bn',
         createdAt: new Date(),
         updatedAt: new Date(),
      },
      isPublic: true,
      isActive: true,
      audiobookTags: [],
      audioBookGenres: [],
   };

   beforeEach(() => {
      jest.clearAllMocks();

      mockCreate.mockResolvedValue(createdAudiobook);
      mockGenreCreateMany.mockResolvedValue({ count: 1 });
      mockTagCreateMany.mockResolvedValue({ count: 0 });
      mockDeleteManyGenres.mockResolvedValue({ count: 1 });
      mockDeleteManyTags.mockResolvedValue({ count: 0 });
      mockDeleteAudiobook.mockResolvedValue(createdAudiobook);
      mockGenreFindMany.mockResolvedValue([{ id: 'genre-1' }]);
      mockTagFindMany.mockResolvedValue([]);
      mockMoodFindUnique.mockResolvedValue(null);
      mockLanguageFindUnique.mockResolvedValue({ id: 'lang-bn' });
      mockFindUnique.mockResolvedValue(createdAudiobook);

      mockTransaction.mockImplementation(async (arg: unknown) => {
         if (typeof arg === 'function') {
            return arg({
               audioBook: { create: mockCreate, delete: mockDeleteAudiobook },
               audioBookGenre: { createMany: mockGenreCreateMany, deleteMany: mockDeleteManyGenres },
               audioBookTag: { createMany: mockTagCreateMany, deleteMany: mockDeleteManyTags },
            });
         }

         return Promise.all(arg as Promise<unknown>[]);
      });

      (ImageAssetService as jest.Mock).mockImplementation(() => ({
         validateUploadSource: mockValidateUploadSource,
         generateAndStoreVariants: mockGenerateAndStoreVariants,
      }));

      const prisma = {
         $transaction: mockTransaction,
         genre: { findMany: mockGenreFindMany },
         tag: { findMany: mockTagFindMany },
         mood: { findUnique: mockMoodFindUnique },
         language: { findUnique: mockLanguageFindUnique },
         audioBook: {
            create: mockCreate,
            delete: mockDeleteAudiobook,
            findUnique: mockFindUnique,
            update: jest.fn(),
         },
         audioBookGenre: {
            createMany: mockGenreCreateMany,
            deleteMany: mockDeleteManyGenres,
         },
         audioBookTag: {
            createMany: mockTagCreateMany,
            deleteMany: mockDeleteManyTags,
         },
      } as unknown as PrismaClient;

      service = new AudioBookService(prisma);
   });

   it('rejects invalid cover images before creating an audiobook', async () => {
      mockValidateUploadSource.mockRejectedValue(
         ApiError.validationError('Image must be at least 1400×2000px. Received 100×100px.'),
      );

      await expect(
         service.createAudioBook(baseCreateData, undefined, undefined, '/tmp/invalid-cover.jpg'),
      ).rejects.toMatchObject({
         statusCode: 400,
         message: 'Image must be at least 1400×2000px. Received 100×100px.',
      });

      expect(mockValidateUploadSource).toHaveBeenCalledWith('audiobook', '/tmp/invalid-cover.jpg');
      expect(mockTransaction).not.toHaveBeenCalled();
   });

   it('rejects invalid genre IDs before creating an audiobook', async () => {
      mockGenreFindMany.mockResolvedValue([]);

      await expect(service.createAudioBook(baseCreateData)).rejects.toMatchObject({
         statusCode: 400,
         message: 'One or more genre IDs are invalid',
      });

      expect(mockTransaction).not.toHaveBeenCalled();
   });

   it('creates the audiobook and genre links atomically in a transaction', async () => {
      mockValidateUploadSource.mockResolvedValue(undefined);

      await service.createAudioBook(baseCreateData);

      expect(mockTransaction).toHaveBeenCalled();
      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockGenreCreateMany).toHaveBeenCalledWith({
         data: [{ audiobookId: 'audiobook-1', genreId: 'genre-1' }],
      });
   });

   it('rolls back the audiobook and relations when variant generation fails after create', async () => {
      mockValidateUploadSource.mockResolvedValue(undefined);
      mockGenerateAndStoreVariants.mockRejectedValue(new Error('Processing failed'));

      await expect(
         service.createAudioBook(baseCreateData, undefined, undefined, '/tmp/cover.jpg'),
      ).rejects.toMatchObject({
         statusCode: 400,
         message: 'Processing failed',
      });

      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockDeleteManyGenres).toHaveBeenCalledWith({ where: { audiobookId: 'audiobook-1' } });
      expect(mockDeleteManyTags).toHaveBeenCalledWith({ where: { audiobookId: 'audiobook-1' } });
      expect(mockDeleteAudiobook).toHaveBeenCalledWith({ where: { id: 'audiobook-1' } });
   });
});
