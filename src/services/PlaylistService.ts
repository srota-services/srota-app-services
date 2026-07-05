/**
 * Playlist Service — user playlists and playlist items
 */
import { Prisma, PrismaClient } from '@prisma/client';
import {
   CreatePlaylistItemRequest,
   CreatePlaylistRequest,
   PlaylistDto,
   PlaylistItemDto,
   PlaylistQueryParams,
   UpdatePlaylistItemRequest,
   UpdatePlaylistRequest,
   toPlaylistDto,
   toPlaylistItemDto,
} from '../models/PlaylistDto';
import { ApiError } from '../types/ApiError';
import { MessageHandler } from '../utils/MessageHandler';
import { HttpStatusCode, ErrorType } from '../types/common';
import { emitCacheInvalidation } from './DomainEventPublisher';
import { runWrite } from '../utils/prismaTransaction';

export class PlaylistService {
   constructor(private prisma: PrismaClient) {}

   async createPlaylist(userId: string, data: CreatePlaylistRequest): Promise<PlaylistDto> {
      const name = data.name.trim();
      if (!name) {
         throw new ApiError(
            MessageHandler.getErrorMessage('validation.playlist_name_required'),
            HttpStatusCode.BAD_REQUEST,
            ErrorType.VALIDATION_ERROR
         );
      }

      const playlist = await runWrite(this.prisma, async (tx) =>
         tx.playlist.create({
            data: {
               userId,
               name,
               description: data.description?.trim() || null,
               isPublic: data.isPublic ?? false,
            },
         }),
      );

      emitCacheInvalidation('playlist', 'created', playlist.id, { userId: userId });
      return toPlaylistDto(playlist, []);
   }

   async getPlaylists(
      userId: string,
      query: PlaylistQueryParams
   ): Promise<{ playlists: PlaylistDto[]; totalCount: number }> {
      const page = query.page ?? 1;
      const limit = query.limit ?? 20;
      const skip = (page - 1) * limit;
      const sortBy = query.sortBy ?? 'createdAt';
      const sortOrder = query.sortOrder ?? 'desc';

      const where: Prisma.PlaylistWhereInput = { userId };
      if (query.isPublic !== undefined) {
         where.isPublic = query.isPublic;
      }

      const [playlists, totalCount] = await Promise.all([
         this.prisma.playlist.findMany({
            where,
            skip,
            take: limit,
            orderBy: { [sortBy]: sortOrder },
            include: {
               items: { orderBy: { position: 'asc' } },
            },
         }),
         this.prisma.playlist.count({ where }),
      ]);

      return {
         playlists: playlists.map((p) => toPlaylistDto(p, p.items)),
         totalCount,
      };
   }

   async getPlaylistById(id: string, userId: string): Promise<PlaylistDto> {
      const playlist = await this.prisma.playlist.findUnique({
         where: { id },
         include: {
            items: { orderBy: { position: 'asc' } },
         },
      });

      if (!playlist) {
         throw new ApiError(
            MessageHandler.getErrorMessage('playlists.not_found'),
            HttpStatusCode.NOT_FOUND,
            ErrorType.NOT_FOUND
         );
      }

      if (playlist.userId !== userId) {
         throw ApiError.forbidden(MessageHandler.getErrorMessage('playlists.access_denied'));
      }

      return toPlaylistDto(playlist, playlist.items);
   }

   async updatePlaylist(
      id: string,
      userId: string,
      data: UpdatePlaylistRequest
   ): Promise<PlaylistDto> {
      const existing = await this.requirePlaylistOwner(id, userId);

      const updateData: Prisma.PlaylistUpdateInput = {};
      if (data.name !== undefined) {
         const name = data.name.trim();
         if (!name) {
            throw new ApiError(
               MessageHandler.getErrorMessage('validation.playlist_name_required'),
               HttpStatusCode.BAD_REQUEST,
               ErrorType.VALIDATION_ERROR
            );
         }
         updateData.name = name;
      }
      if (data.description !== undefined) {
         updateData.description = data.description?.trim() || null;
      }
      if (data.isPublic !== undefined) {
         updateData.isPublic = data.isPublic;
      }

      if (Object.keys(updateData).length === 0) {
         throw new ApiError(
            MessageHandler.getErrorMessage('validation.no_update_fields'),
            HttpStatusCode.BAD_REQUEST,
            ErrorType.VALIDATION_ERROR
         );
      }

      const updated = await runWrite(this.prisma, async (tx) =>
         tx.playlist.update({
            where: { id: existing.id },
            data: updateData,
            include: { items: { orderBy: { position: 'asc' } } },
         }),
      );

      emitCacheInvalidation('playlist', 'updated', id, { userId: userId });
      return toPlaylistDto(updated, updated.items);
   }

   async deletePlaylist(id: string, userId: string): Promise<void> {
      await this.requirePlaylistOwner(id, userId);
      await runWrite(this.prisma, async (tx) => tx.playlist.delete({ where: { id } }));
      emitCacheInvalidation('playlist', 'deleted', id, { userId: userId });
   }

   async addPlaylistItem(
      playlistId: string,
      userId: string,
      data: CreatePlaylistItemRequest
   ): Promise<PlaylistItemDto> {
      await this.requirePlaylistOwner(playlistId, userId);

      const audiobook = await this.prisma.audioBook.findUnique({
         where: { id: data.audiobookId },
      });
      if (!audiobook) {
         throw new ApiError(
            MessageHandler.getErrorMessage('not_found.audiobook'),
            HttpStatusCode.NOT_FOUND,
            ErrorType.NOT_FOUND
         );
      }

      const duplicate = await this.prisma.playlistItem.findUnique({
         where: {
            playlistId_audiobookId: {
               playlistId,
               audiobookId: data.audiobookId,
            },
         },
      });
      if (duplicate) {
         throw new ApiError(
            MessageHandler.getErrorMessage('playlist_items.already_exists'),
            HttpStatusCode.CONFLICT,
            ErrorType.CONFLICT
         );
      }

      let position = data.position;
      if (position === undefined) {
         const maxItem = await this.prisma.playlistItem.findFirst({
            where: { playlistId },
            orderBy: { position: 'desc' },
         });
         position = (maxItem?.position ?? 0) + 1;
      }

      const item = await runWrite(this.prisma, async (tx) =>
         tx.playlistItem.create({
            data: {
               playlistId,
               audiobookId: data.audiobookId,
               position,
            },
         }),
      );

      emitCacheInvalidation('playlist-item', 'created', item.id, { playlistId });
      return toPlaylistItemDto(item);
   }

   async getPlaylistItems(
      playlistId: string,
      userId: string
   ): Promise<PlaylistItemDto[]> {
      await this.requirePlaylistOwner(playlistId, userId);

      const items = await this.prisma.playlistItem.findMany({
         where: { playlistId },
         orderBy: { position: 'asc' },
      });

      return items.map(toPlaylistItemDto);
   }

   async updatePlaylistItem(
      playlistId: string,
      itemId: string,
      userId: string,
      data: UpdatePlaylistItemRequest
   ): Promise<PlaylistItemDto> {
      await this.requirePlaylistOwner(playlistId, userId);

      const item = await this.prisma.playlistItem.findFirst({
         where: { id: itemId, playlistId },
      });
      if (!item) {
         throw new ApiError(
            MessageHandler.getErrorMessage('playlist_items.not_found'),
            HttpStatusCode.NOT_FOUND,
            ErrorType.NOT_FOUND
         );
      }

      const updated = await runWrite(this.prisma, async (tx) =>
         tx.playlistItem.update({
            where: { id: itemId },
            data: { position: data.position },
         }),
      );

      emitCacheInvalidation('playlist-item', 'updated', itemId, { playlistId });
      return toPlaylistItemDto(updated);
   }

   async deletePlaylistItem(
      playlistId: string,
      itemId: string,
      userId: string
   ): Promise<void> {
      await this.requirePlaylistOwner(playlistId, userId);

      const item = await this.prisma.playlistItem.findFirst({
         where: { id: itemId, playlistId },
      });
      if (!item) {
         throw new ApiError(
            MessageHandler.getErrorMessage('playlist_items.not_found'),
            HttpStatusCode.NOT_FOUND,
            ErrorType.NOT_FOUND
         );
      }

      await runWrite(this.prisma, async (tx) => tx.playlistItem.delete({ where: { id: itemId } }));
      emitCacheInvalidation('playlist-item', 'deleted', itemId, { playlistId });
   }

   private async requirePlaylistOwner(playlistId: string, userId: string) {
      const playlist = await this.prisma.playlist.findUnique({ where: { id: playlistId } });
      if (!playlist) {
         throw new ApiError(
            MessageHandler.getErrorMessage('playlists.not_found'),
            HttpStatusCode.NOT_FOUND,
            ErrorType.NOT_FOUND
         );
      }
      if (playlist.userId !== userId) {
         throw ApiError.forbidden(MessageHandler.getErrorMessage('playlists.access_denied'));
      }
      return playlist;
   }
}
