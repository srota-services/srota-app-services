/**
 * Listening history DTO classes for API communication
 */
import { ListeningHistory as PrismaListeningHistory } from '@prisma/client';

export interface ListeningHistoryAudiobookSummary {
   id: string;
   title: string;
   author: string;
   narrator?: string | null;
   coverImage?: string | null;
   imageAssets?: Record<string, string>;
   duration?: number | null;
}

export interface ListeningHistoryDto {
   id: string;
   userId: string;
   audiobookId: string;
   currentPosition: number;
   completed: boolean;
   lastListenedAt: Date;
   createdAt: Date;
   updatedAt: Date;
}

export interface ListeningHistoryWithAudiobookDto extends ListeningHistoryDto {
   audiobook: ListeningHistoryAudiobookSummary;
}

export interface ListeningHistoryQueryParams {
   audiobookId?: string;
   completed?: boolean;
   page?: number;
   limit?: number;
   sortBy?: 'lastListenedAt' | 'createdAt' | 'updatedAt' | 'currentPosition';
   sortOrder?: 'asc' | 'desc';
}

type ListeningHistoryWithAudiobook = PrismaListeningHistory & {
   audiobook: ListeningHistoryAudiobookSummary;
};

export function toListeningHistoryDto(history: PrismaListeningHistory): ListeningHistoryDto {
   return {
      id: history.id,
      userId: history.userId,
      audiobookId: history.audiobookId,
      currentPosition: history.currentPosition,
      completed: history.completed,
      lastListenedAt: history.lastListenedAt,
      createdAt: history.createdAt,
      updatedAt: history.updatedAt,
   };
}

export function toListeningHistoryWithAudiobookDto(
   history: ListeningHistoryWithAudiobook
): ListeningHistoryWithAudiobookDto {
   return {
      ...toListeningHistoryDto(history),
      audiobook: {
         id: history.audiobook.id,
         title: history.audiobook.title,
         author: history.audiobook.author,
         narrator: history.audiobook.narrator ?? null,
         coverImage: history.audiobook.coverImage ?? null,
         duration: history.audiobook.duration ?? null,
      },
   };
}
