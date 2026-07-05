/**
 * UserAudioBook DTO (Data Transfer Object) classes
 * Provides type-safe data structures for API communication
 */
import { UserAudioBook as PrismaUserAudioBook, UserAudioBookType } from '@prisma/client';

export interface UserAudioBookDto {
   id: string;
   userId: string;
   audiobookId: string;
   type: UserAudioBookType;
   progress?: number; // Total seconds listened (sum of chapter currentPosition values)
   createdAt: Date;
   updatedAt: Date;
}

export interface UserAudioBookWithRelations extends UserAudioBookDto {
   progress?: number;
   user?: {
      userId: string;
      username: string;
   };
   audiobook: {
      id: string;
      title: string;
      author: string;
      narrator?: string | null;
      coverImage?: string | null;
      imageAssets?: Record<string, string>;
   };
}

export interface CreateUserAudioBookDto {
   userId: string;
   audiobookId: string;
}

export interface UserAudioBookQueryParams {
   page?: number;
   limit?: number;
   sortBy?: string;
   sortOrder?: 'asc' | 'desc';
   userId?: string;
   audiobookId?: string;
   type?: UserAudioBookType;
}

/**
 * Convert Prisma UserAudioBook model to UserAudioBookDto
 */
export function toUserAudioBookDto(userAudioBook: PrismaUserAudioBook): UserAudioBookDto {
   return {
      id: userAudioBook.id,
      userId: userAudioBook.userId,
      audiobookId: userAudioBook.audiobookId,
      type: userAudioBook.type,
      progress: userAudioBook.progress ?? undefined,
      createdAt: userAudioBook.createdAt,
      updatedAt: userAudioBook.updatedAt
   };
}

type UserAudioBookWithAudiobook = PrismaUserAudioBook & {
   audiobook: {
      id: string;
      title: string;
      author: string;
      narrator: string | null;
      coverImage: string | null;
   };
};

/**
 * Convert Prisma UserAudioBook with audiobook relation to UserAudioBookWithRelations
 */
export function toUserAudioBookWithRelations(userAudioBook: UserAudioBookWithAudiobook): UserAudioBookWithRelations {
   return {
      id: userAudioBook.id,
      userId: userAudioBook.userId,
      audiobookId: userAudioBook.audiobookId,
      type: userAudioBook.type,
      progress: userAudioBook.progress ?? undefined,
      createdAt: userAudioBook.createdAt,
      updatedAt: userAudioBook.updatedAt,
      audiobook: {
         id: userAudioBook.audiobook.id,
         title: userAudioBook.audiobook.title,
         author: userAudioBook.audiobook.author,
         narrator: userAudioBook.audiobook.narrator,
         coverImage: userAudioBook.audiobook.coverImage
      }
   };
}
