/**
 * LanguageService Tests
 */
import { Prisma } from '@prisma/client';
import { LanguageService } from '../../services/LanguageService';
import { ApiError } from '../../types/ApiError';
import { attachPrismaTransaction } from '../helpers/prismaMock';

const mockPrisma = attachPrismaTransaction({
   language: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
   },
}) as any;

jest.mock('../../utils/MessageHandler', () => ({
   MessageHandler: {
      getErrorMessage: (key: string) => key,
   },
}));

describe('LanguageService', () => {
   let languageService: LanguageService;

   beforeEach(() => {
      languageService = new LanguageService(mockPrisma);
      jest.clearAllMocks();
   });

   describe('createLanguage', () => {
      it('creates a language when name and code are unique', async () => {
         mockPrisma.language.findFirst.mockResolvedValue(null);
         mockPrisma.language.create.mockResolvedValue({
            id: 'l1',
            name: 'Hindi',
            code: 'hi',
            createdAt: new Date(),
            updatedAt: new Date(),
         });

         const result = await languageService.createLanguage('Hindi', 'hi');
         expect(result.code).toBe('hi');
         expect(mockPrisma.language.create).toHaveBeenCalledWith({
            data: { name: 'Hindi', code: 'hi' },
         });
      });

      it('throws on duplicate code', async () => {
         mockPrisma.language.findFirst.mockResolvedValue({ id: 'l1', name: 'Hindi', code: 'hi' });
         await expect(languageService.createLanguage('Hindi', 'hi')).rejects.toBeInstanceOf(ApiError);
      });
   });

   describe('getLanguageById', () => {
      it('throws when language is missing', async () => {
         mockPrisma.language.findUnique.mockResolvedValue(null);
         await expect(languageService.getLanguageById('missing')).rejects.toBeInstanceOf(ApiError);
      });
   });

   describe('deleteLanguage', () => {
      it('throws when language is in use by audiobooks', async () => {
         mockPrisma.language.findUnique.mockResolvedValue({
            id: 'l1',
            name: 'Bengali',
            code: 'bn',
            createdAt: new Date(),
            updatedAt: new Date(),
         });
         const fkError = new Prisma.PrismaClientKnownRequestError('FK', {
            code: 'P2003',
            clientVersion: 'test',
         });
         mockPrisma.language.delete.mockRejectedValue(fkError);

         await expect(languageService.deleteLanguage('l1')).rejects.toBeInstanceOf(ApiError);
      });
   });
});
