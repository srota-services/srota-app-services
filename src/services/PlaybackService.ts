/**
 * Playback Service
 * Handles real-time audiobook playback functionality
 */
import { PrismaClient } from '@prisma/client';
import {
   PlaybackState,
   PlaybackSession,
   PlaybackStats,
   PlaybackSyncRequest,
   PlaybackControlRequest
} from '../models/PlaybackDto';
import { ApiError } from '../types/ApiError';
import { runInTransaction } from '../utils/prismaTransaction';
import { rethrowServiceError } from '../utils/serviceError';
import { MessageHandler } from '../utils/MessageHandler';

export class PlaybackService {
   private playbackSessions: Map<string, PlaybackSession> = new Map();

   constructor(private prisma: PrismaClient) { }

   /**
    * Get userProfileId from userId
    * Helper method to resolve UserProfile.id from User.id
    */
   private async getUserProfileId(userId: string): Promise<string> {
      const userProfile = await this.prisma.userProfile.findUnique({
         where: { userId },
         select: { id: true },
      });

      if (!userProfile) {
         throw new ApiError('User profile not found', 404);
      }

      return userProfile.id;
   }

   /**
    * Initialize or get existing playback session
    */
   async initializePlaybackSession(userId: string, audiobookId: string, chapterId?: string): Promise<PlaybackSession> {
      try {
         // Resolve userProfileId from userId
         const userProfileId = await this.getUserProfileId(userId);
         const sessionKey = `${userProfileId}-${audiobookId}`;

         // Check if session already exists
         if (this.playbackSessions.has(sessionKey)) {
            const session = this.playbackSessions.get(sessionKey)!;

            // Update chapter if provided
            if (chapterId) {
               session.currentChapterId = chapterId;
               session.currentPosition = 0; // Reset position when changing chapters
            }

            return session;
         }

         // Get user's listening history for this audiobook
         const listeningHistory = await this.prisma.listeningHistory.findUnique({
            where: {
               userProfileId_audiobookId: {
                  userProfileId,
                  audiobookId,
               },
            },
         });

         // Get chapter progress if chapterId is provided
         let currentPosition = 0;
         if (chapterId) {
            const chapterProgress = await this.prisma.chapterProgress.findUnique({
               where: {
                  userProfileId_chapterId: {
                     userProfileId,
                     chapterId,
                  },
               },
            });
            currentPosition = chapterProgress?.currentPosition || 0;
         } else if (listeningHistory) {
            currentPosition = listeningHistory.currentPosition;
         }

         // Create new session
         const session = {
            id: sessionKey,
            userProfileId,
            audiobookId,
            currentChapterId: chapterId || undefined,
            currentPosition,
            playbackSpeed: 1.0,
            volume: 100,
            isPlaying: false,
            lastUpdated: new Date(),
            sessionDuration: 0,
         } as PlaybackSession;

         this.playbackSessions.set(sessionKey, session);
         return session;
      } catch (error) {
         if (error instanceof ApiError) {
            throw error;
         }
         rethrowServiceError(error, { operation: 'initializePlaybackSession' }, MessageHandler.getErrorMessage('internal.default'));
      }
   }

   /**
    * Sync playback state (play, pause, seek)
    */
   async syncPlayback(userId: string, syncRequest: PlaybackSyncRequest): Promise<PlaybackState> {
      try {
         // Resolve userProfileId from userId
         const userProfileId = await this.getUserProfileId(userId);
         const sessionKey = `${userProfileId}-${syncRequest.audiobookId}`;
         const session = this.playbackSessions.get(sessionKey);

         if (!session) {
            throw new ApiError('Playback session not found. Please initialize session first.', 404);
         }

         // Handle different sync actions
         switch (syncRequest.action) {
            case 'play':
               session.isPlaying = true;
               break;
            case 'pause':
               session.isPlaying = false;
               break;
            case 'seek':
               if (syncRequest.position !== undefined) {
                  await this.seekToPosition(userProfileId, syncRequest.position, session);
               } else {
                  throw new ApiError('Position is required for seek action', 400);
               }
               break;
            default:
               throw new ApiError('Invalid sync action', 400);
         }

         // Update chapter if provided
         if (syncRequest.chapterId && syncRequest.chapterId !== session.currentChapterId) {
            session.currentChapterId = syncRequest.chapterId;
            if (syncRequest.action !== 'seek') {
               session.currentPosition = 0; // Reset position when changing chapters (unless seeking)
            }
         }

         session.lastUpdated = new Date();
         this.playbackSessions.set(sessionKey, session);

         // Update database with progress
         await this.updatePlaybackProgress(session);

         return this.getPlaybackState(session);
      } catch (error) {
         if (error instanceof ApiError) {
            throw error;
         }
         throw new ApiError('Failed to sync playback', 500);
      }
   }

   /**
    * Seek to a specific position
    */
   async seekToPosition(userProfileId: string, position: number, session?: PlaybackSession): Promise<void> {
      try {
         const sessionKey = `${userProfileId}-${session?.audiobookId}`;
         const currentSession = session || this.playbackSessions.get(sessionKey);

         if (!currentSession) {
            throw new ApiError('Playback session not found', 404);
         }

         // Validate position
         if (position < 0) {
            throw new ApiError('Position cannot be negative', 400);
         }

         // If we have a chapter, validate against chapter duration
         if (currentSession.currentChapterId) {
            const chapter = await this.prisma.chapter.findUnique({
               where: { id: currentSession.currentChapterId },
            });

            if (chapter && chapter.duration != null && position > chapter.duration) {
               throw new ApiError('Position cannot exceed chapter duration', 400);
            }
         }

         currentSession.currentPosition = position;
         currentSession.lastUpdated = new Date();
         this.playbackSessions.set(sessionKey, currentSession);

         // Update chapter progress if applicable
         if (currentSession.currentChapterId) {
            await this.persistPlaybackProgress(
               userProfileId,
               currentSession.audiobookId,
               currentSession.currentChapterId,
               position,
            );
         }
      } catch (error) {
         if (error instanceof ApiError) {
            throw error;
         }
         rethrowServiceError(error, { operation: 'seekToPosition' }, MessageHandler.getErrorMessage('internal.default'));
      }
   }

   /**
    * Get current playback state
    */
   getPlaybackState(session: PlaybackSession): PlaybackState {
      return {
         isPlaying: session.isPlaying,
         currentPosition: session.currentPosition,
         playbackSpeed: session.playbackSpeed,
         volume: session.volume,
         currentChapterId: session.currentChapterId || undefined,
         audiobookId: session.audiobookId,
         userProfileId: session.userProfileId,
      } as PlaybackState;
   }

   private async persistPlaybackProgress(
      userProfileId: string,
      audiobookId: string,
      chapterId: string | undefined,
      currentPosition: number,
   ): Promise<void> {
      await runInTransaction(this.prisma, async (tx) => {
         await tx.listeningHistory.upsert({
            where: {
               userProfileId_audiobookId: {
                  userProfileId,
                  audiobookId,
               },
            },
            update: {
               currentPosition,
               lastListenedAt: new Date(),
            },
            create: {
               userProfileId,
               audiobookId,
               currentPosition,
               lastListenedAt: new Date(),
            },
         });

         if (chapterId) {
            await tx.chapterProgress.upsert({
               where: {
                  userProfileId_chapterId: {
                     userProfileId,
                     chapterId,
                  },
               },
               update: {
                  currentPosition,
                  lastListenedAt: new Date(),
               },
               create: {
                  userProfileId,
                  chapterId,
                  currentPosition,
                  lastListenedAt: new Date(),
               },
            });
         }
      });
   }

   /**
    * Update playback progress in database
    */
   private async updatePlaybackProgress(session: PlaybackSession): Promise<void> {
      try {
         await this.persistPlaybackProgress(
            session.userProfileId,
            session.audiobookId,
            session.currentChapterId,
            session.currentPosition,
         );
      } catch (error) {
         rethrowServiceError(error, { operation: 'updatePlaybackProgress' }, MessageHandler.getErrorMessage('internal.default'));
      }
   }

   /**
    * Get playback statistics for a user
    */
   async getPlaybackStats(userId: string, audiobookId?: string): Promise<PlaybackStats> {
      try {
         // Resolve userProfileId from userId
         const userProfileId = await this.getUserProfileId(userId);
         const whereClause = audiobookId
            ? { userProfileId, audiobookId }
            : { userProfileId };

         const [listeningHistory, chapterProgress] = await Promise.all([
            this.prisma.listeningHistory.findMany({
               where: whereClause,
               include: {
                  audiobook: {
                     select: {
                        id: true,
                        title: true,
                     },
                  },
               },
            }),
            this.prisma.chapterProgress.findMany({
               where: whereClause,
               include: {
                  chapter: {
                     select: {
                        id: true,
                        audiobookId: true,
                     },
                  },
               },
            }),
         ]);

         const totalListeningTime = listeningHistory.reduce((sum, history) => {
            return sum + history.currentPosition;
         }, 0);

         const completedChapters = chapterProgress.filter(progress => progress.completed).length;
         const totalChapters = chapterProgress.length;

         return {
            totalListeningTime,
            averageSessionDuration: totalListeningTime / Math.max(listeningHistory.length, 1),
            mostUsedSpeed: 1.0, // TODO: Track this in session data
            chaptersCompleted: completedChapters,
            totalChapters,
            completionPercentage: totalChapters > 0 ? (completedChapters / totalChapters) * 100 : 0,
         };
      } catch (error) {
         rethrowServiceError(error, { operation: 'getPlaybackStats' }, MessageHandler.getErrorMessage('internal.default'));
      }
   }

   /**
    * Clean up inactive sessions
    */
   cleanupInactiveSessions(): void {
      const now = new Date();
      const inactiveThreshold = 30 * 60 * 1000; // 30 minutes

      for (const [sessionKey, session] of Array.from(this.playbackSessions.entries())) {
         if (now.getTime() - session.lastUpdated.getTime() > inactiveThreshold) {
            this.playbackSessions.delete(sessionKey);
         }
      }
   }

   /**
    * Handle playback control requests
    */
   async handlePlaybackControl(userProfileId: string, controlRequest: PlaybackControlRequest): Promise<PlaybackState> {
      try {
         const sessionKey = `${userProfileId}-${controlRequest.audiobookId}`;
         let session = this.playbackSessions.get(sessionKey);

         if (!session) {
            session = await this.initializePlaybackSession(userProfileId, controlRequest.audiobookId, controlRequest.chapterId);
         }

         switch (controlRequest.action) {
            case 'play':
               session.isPlaying = true;
               break;
            case 'pause':
               session.isPlaying = false;
               break;
            case 'stop':
               session.isPlaying = false;
               session.currentPosition = 0;
               break;
            case 'seek':
               if (controlRequest.position !== undefined) {
                  await this.seekToPosition(userProfileId, controlRequest.position, session);
               }
               break;
            case 'speed':
               if (controlRequest.speed !== undefined) {
                  session.playbackSpeed = controlRequest.speed;
               }
               break;
            case 'volume':
               if (controlRequest.volume !== undefined) {
                  session.volume = Math.max(0, Math.min(1, controlRequest.volume));
               }
               break;
         }

         return {
            isPlaying: session.isPlaying,
            currentPosition: session.currentPosition,
            audiobookId: session.audiobookId,
            ...(session.currentChapterId && { currentChapterId: session.currentChapterId }),
            playbackSpeed: session.playbackSpeed,
            volume: session.volume,
            userProfileId: session.userProfileId
         };
      } catch (error) {
         if (error instanceof ApiError) {
            throw error;
         }
         rethrowServiceError(error, { operation: 'handlePlaybackControl' }, MessageHandler.getErrorMessage('internal.default'));
      }
   }

   /**
    * Change playback speed
    */
   async changePlaybackSpeed(userProfileId: string, audiobookId: string, speed: number): Promise<void> {
      try {
         const sessionKey = `${userProfileId}-${audiobookId}`;
         const session = this.playbackSessions.get(sessionKey);

         if (session) {
            session.playbackSpeed = Math.max(0.5, Math.min(3.0, speed));
         }
      } catch (error) {
         rethrowServiceError(error, { operation: 'changePlaybackSpeed' }, MessageHandler.getErrorMessage('internal.default'));
      }
   }

   /**
    * Navigate to a specific chapter
    */
   async navigateToChapter(userProfileId: string, audiobookId: string, chapterId: string): Promise<void> {
      try {
         const sessionKey = `${userProfileId}-${audiobookId}`;
         const session = this.playbackSessions.get(sessionKey);

         if (session) {
            session.currentChapterId = chapterId;
            session.currentPosition = 0;
         } else {
            await this.initializePlaybackSession(userProfileId, audiobookId, chapterId);
         }
      } catch (error) {
         rethrowServiceError(error, { operation: 'navigateToChapter' }, MessageHandler.getErrorMessage('internal.default'));
      }
   }

   /**
    * Get active sessions count
    */
   getActiveSessionsCount(): number {
      return this.playbackSessions.size;
   }
}
