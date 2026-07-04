import { PrismaClient } from '@prisma/client';
import { AuthorProfileService } from '../../services/AuthorProfileService';
import { attachPrismaTransaction } from '../helpers/prismaMock';

jest.mock('../../services/FileUrlService', () => ({
   fileUrlService: {
      resolveAuthorProfileMedia: jest.fn(async (dto: unknown) => dto),
   },
}));

jest.mock('../../services/ImageAssetService', () => ({
   ImageAssetService: jest.fn().mockImplementation(() => ({
      resolveSourceImageToLocalPath: jest.fn().mockResolvedValue('/tmp/source-image.jpg'),
      generateAndStoreVariants: jest.fn().mockResolvedValue({
         primaryStorageKey: 'uploads/images/authors/author-1/square_512.jpg',
         variants: {},
      }),
   })),
}));

describe('AuthorProfileService', () => {
   let service: AuthorProfileService;
   let mockPrisma: {
      authorProfile: {
         findUnique: jest.Mock;
         create: jest.Mock;
         update: jest.Mock;
      };
      authorTier: {
         findUnique: jest.Mock;
         create: jest.Mock;
      };
   };

   beforeEach(() => {
      mockPrisma = attachPrismaTransaction({
         authorProfile: {
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
         },
         authorTier: {
            findUnique: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({}),
         },
      });
      service = new AuthorProfileService(mockPrisma as unknown as PrismaClient);
   });

   it('creates author profile from event payload', async () => {
      mockPrisma.authorProfile.findUnique.mockResolvedValue(null);
      mockPrisma.authorProfile.create.mockResolvedValue({
         id: 'profile-1',
         authorId: 'author-1',
         avatar: null,
         createdAt: new Date(),
         updatedAt: new Date(),
      });
      mockPrisma.authorProfile.update.mockResolvedValue({
         id: 'profile-1',
         authorId: 'author-1',
         avatar: 'uploads/images/authors/author-1/square_512.jpg',
         createdAt: new Date(),
         updatedAt: new Date(),
      });

      const result = await service.createFromEvent({
         authorId: 'author-1',
         avatar: '/uploads/avatar.jpg',
      });

      expect(result?.authorId).toBe('author-1');
      expect(mockPrisma.authorProfile.create).toHaveBeenCalled();
      expect(mockPrisma.authorTier.create).toHaveBeenCalledWith({
         data: {
            authorId: 'author-1',
            tier: 'TIER_3',
         },
      });
   });
});
