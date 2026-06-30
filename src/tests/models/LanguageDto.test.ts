/**
 * LanguageDto Tests
 */
import { LanguageDto, toLanguageDto } from '../../models/LanguageDto';
import { Language as PrismaLanguage } from '@prisma/client';

describe('LanguageDto', () => {
   const createMockPrismaLanguage = (overrides = {}): PrismaLanguage => ({
      id: 'lang-id',
      name: 'Bengali',
      code: 'bn',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-02'),
      ...overrides,
   });

   describe('toLanguageDto', () => {
      it('should convert Prisma Language to DTO', () => {
         const prismaLanguage = createMockPrismaLanguage();
         const result = toLanguageDto(prismaLanguage);

         expect(result).toEqual<LanguageDto>({
            id: 'lang-id',
            name: 'Bengali',
            code: 'bn',
            createdAt: prismaLanguage.createdAt,
            updatedAt: prismaLanguage.updatedAt,
         });
      });
   });
});
