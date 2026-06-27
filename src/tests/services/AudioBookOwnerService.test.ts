import { PrismaClient } from '@prisma/client';
import { AudioBookOwnerService } from '../../services/AudioBookOwnerService';
import { authClient } from '../../clients/AuthClient';
import { AudioBookDto } from '../../models/AudioBookDto';

jest.mock('../../clients/AuthClient', () => ({
   authClient: {
      getOrganizationCatalogById: jest.fn(),
      getAuthorCatalogById: jest.fn(),
   },
}));

jest.mock('../../services/FileUrlService', () => ({
   fileUrlService: {
      resolveForClient: jest.fn(async (path: string) => `https://cdn.example.com/${path}`),
      resolveImageAssetsForEntity: jest.fn(async () => ({})),
   },
}));

describe('AudioBookOwnerService', () => {
   let service: AudioBookOwnerService;
   let mockPrisma: { authorProfile: { findMany: jest.Mock } };

   const baseDto = (overrides: Partial<AudioBookDto> = {}): AudioBookDto => ({
      id: 'book-1',
      title: 'Title',
      author: 'Author',
      language: 'en',
      isActive: true,
      isPublic: true,
      subscriptionGatingMode: 'NONE',
      createdAt: new Date(),
      updatedAt: new Date(),
      owner: { type: 'ORGANIZATION', id: 'org-1' },
      ...overrides,
   });

   beforeEach(() => {
      jest.clearAllMocks();
      mockPrisma = {
         authorProfile: {
            findMany: jest.fn().mockResolvedValue([]),
         },
      };
      service = new AudioBookOwnerService(mockPrisma as unknown as PrismaClient);
   });

   it('returns dtos unchanged when access token is missing', async () => {
      const dtos = [baseDto()];
      const result = await service.attachOwnerDetails(dtos);
      expect(result).toEqual(dtos);
      expect(authClient.getOrganizationCatalogById).not.toHaveBeenCalled();
   });

   it('hydrates organization owner details', async () => {
      (authClient.getOrganizationCatalogById as jest.Mock).mockResolvedValue({
         id: 'org-1',
         name: 'Org One',
         slug: 'org-one',
         image: 'uploads/orgs/logo.jpg',
      });

      const [result] = await service.attachOwnerDetails([baseDto()], 'token');

      expect(authClient.getOrganizationCatalogById).toHaveBeenCalledWith('org-1', 'token');
      expect(result?.owner.organization).toEqual(
         expect.objectContaining({
            id: 'org-1',
            name: 'Org One',
            slug: 'org-one',
            image: 'https://cdn.example.com/uploads/orgs/logo.jpg',
         }),
      );
   });

   it('hydrates author owner details with avatar from AuthorProfile', async () => {
      (authClient.getAuthorCatalogById as jest.Mock).mockResolvedValue({
         id: 'author-1',
         slug: 'author-one',
         userId: 'user-1',
         firstName: 'Ada',
         lastName: 'Lovelace',
      });
      mockPrisma.authorProfile.findMany.mockResolvedValue([
         { authorId: 'author-1', avatar: 'uploads/authors/av.jpg' },
      ]);

      const [result] = await service.attachOwnerDetails(
         [baseDto({ owner: { type: 'AUTHOR', id: 'author-1' } })],
         'token',
      );

      expect(result?.owner.author).toEqual(
         expect.objectContaining({
            id: 'author-1',
            slug: 'author-one',
            firstName: 'Ada',
            avatar: 'https://cdn.example.com/uploads/authors/av.jpg',
         }),
      );
   });
});
