/**
 * Playlist and PlaylistItem DTO classes for API communication
 */
import { Playlist as PrismaPlaylist, PlaylistItem as PrismaPlaylistItem } from '@prisma/client';

export interface PlaylistItemDto {
   id: string;
   playlistId: string;
   audiobookId: string;
   position: number;
   createdAt: Date;
}

export interface PlaylistDto {
   id: string;
   userId: string;
   name: string;
   description?: string | null;
   isPublic: boolean;
   createdAt: Date;
   updatedAt: Date;
   items?: PlaylistItemDto[];
}

export interface CreatePlaylistRequest {
   name: string;
   description?: string;
   isPublic?: boolean;
}

export interface UpdatePlaylistRequest {
   name?: string;
   description?: string | null;
   isPublic?: boolean;
}

export interface CreatePlaylistItemRequest {
   audiobookId: string;
   position?: number;
}

export interface UpdatePlaylistItemRequest {
   position: number;
}

export interface PlaylistQueryParams {
   isPublic?: boolean;
   page?: number;
   limit?: number;
   sortBy?: 'createdAt' | 'updatedAt' | 'name';
   sortOrder?: 'asc' | 'desc';
}

export function toPlaylistItemDto(item: PrismaPlaylistItem): PlaylistItemDto {
   return {
      id: item.id,
      playlistId: item.playlistId,
      audiobookId: item.audiobookId,
      position: item.position,
      createdAt: item.createdAt,
   };
}

export function toPlaylistDto(
   playlist: PrismaPlaylist,
   items?: PrismaPlaylistItem[]
): PlaylistDto {
   const dto: PlaylistDto = {
      id: playlist.id,
      userId: playlist.userId,
      name: playlist.name,
      description: playlist.description,
      isPublic: playlist.isPublic,
      createdAt: playlist.createdAt,
      updatedAt: playlist.updatedAt,
   };
   if (items) {
      dto.items = items.map(toPlaylistItemDto);
   }
   return dto;
}
