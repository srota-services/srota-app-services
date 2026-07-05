import { PrismaClient } from '@prisma/client';
import { AuthorProfileService } from '../../services/AuthorProfileService';
import { attachPrismaTransaction } from '../helpers/prismaMock';
import { authClient } from '../../clients/AuthClient';

jest.mock('../../services/FileUrlService', () => ({
   fileUrlService: {
      resolveAuthorProfileMedia: jest.fn(async (dto: unknown) => dto),
   },
}));

jest.mock('../../clients/AuthClient', () => ({
   authClient: {
      getAuthorCatalogById: jest.fn(),
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
         findMany: jest.Mock;
         count: jest.Mock;
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
            findMany: jest.fn(),
            count: jest.fn(),
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

   it('lists discoverable authors enriched with auth catalog data', async () => {
      mockPrisma.authorProfile.findMany.mockResolvedValue([
         {
            id: 'profile-1',
            authorId: 'author-1',
            avatar: 'avatar.jpg',
            discoverable: true,
            createdAt: new Date(),
            updatedAt: new Date(),
         },
      ]);
      mockPrisma.authorProfile.count.mockResolvedValue(1);
      (authClient.getAuthorCatalogById as jest.Mock).mockResolvedValue({
         id: 'author-1',
         slug: 'jane-doe',
         userId: 'user-1',
         firstName: 'Jane',
         lastName: 'Doe',
      });

      const result = await service.listDiscoverableAuthors('token', { page: 1, limit: 10 });

      expect(mockPrisma.authorProfile.findMany).toHaveBeenCalledWith(
         expect.objectContaining({
            where: { discoverable: true },
            skip: 0,
            take: 10,
         }),
      );
      expect(authClient.getAuthorCatalogById).toHaveBeenCalledWith('author-1', 'token');
      expect(result.totalCount).toBe(1);
      expect(result.authors).toEqual([
         expect.objectContaining({
            authorId: 'author-1',
            slug: 'jane-doe',
            firstName: 'Jane',
            lastName: 'Doe',
            discoverable: true,
         }),
      ]);
   });
});
