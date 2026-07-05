/**
 * PlaylistService ownership tests
 */
import { PrismaClient } from '@prisma/client';
import { PlaylistService } from '../../services/PlaylistService';
import { ApiError } from '../../types/ApiError';

describe('PlaylistService ownership', () => {
   const ownerProfileId = 'profile-owner';
   const otherProfileId = 'profile-other';
   const playlistId = 'playlist-1';

   let prisma: {
      playlist: {
         findMany: jest.Mock;
         count: jest.Mock;
         findUnique: jest.Mock;
         delete: jest.Mock;
      };
   };
   let service: PlaylistService;

   beforeEach(() => {
      prisma = {
         playlist: {
            findMany: jest.fn(),
            count: jest.fn(),
            findUnique: jest.fn(),
            delete: jest.fn(),
         },
      };
      service = new PlaylistService(prisma as unknown as PrismaClient);
   });

   it('lists only the authenticated user playlists', async () => {
      prisma.playlist.findMany.mockResolvedValue([]);
      prisma.playlist.count.mockResolvedValue(0);

      await service.getPlaylists(ownerProfileId, {});

      expect(prisma.playlist.findMany).toHaveBeenCalledWith(
         expect.objectContaining({
            where: { userId: ownerProfileId },
         })
      );
   });

   it('does not list other users playlists when isPublic=true', async () => {
      prisma.playlist.findMany.mockResolvedValue([]);
      prisma.playlist.count.mockResolvedValue(0);

      await service.getPlaylists(ownerProfileId, { isPublic: true });

      expect(prisma.playlist.findMany).toHaveBeenCalledWith(
         expect.objectContaining({
            where: { userId: ownerProfileId, isPublic: true },
         })
      );
   });

   it('forbids another user from reading a public playlist by id', async () => {
      prisma.playlist.findUnique.mockResolvedValue({
         id: playlistId,
         userId: ownerProfileId,
         name: 'Shared Name',
         description: null,
         isPublic: true,
         createdAt: new Date(),
         updatedAt: new Date(),
         items: [],
      });

      await expect(service.getPlaylistById(playlistId, otherProfileId)).rejects.toBeInstanceOf(ApiError);
   });

   it('forbids another user from listing playlist items', async () => {
      prisma.playlist.findUnique.mockResolvedValue({
         id: playlistId,
         userId: ownerProfileId,
         name: 'Mine',
         description: null,
         isPublic: true,
         createdAt: new Date(),
         updatedAt: new Date(),
      });

      await expect(service.getPlaylistItems(playlistId, otherProfileId)).rejects.toBeInstanceOf(ApiError);
   });
});
