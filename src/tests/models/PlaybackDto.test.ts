/**
 * PlaybackDto Tests
 * Tests for Playback DTO interfaces and constants
 */

import {
   PlaybackState,
   PlaybackSyncRequest,
   PlaybackControlRequest,
   SeekRequest,
   SpeedChangeRequest,
   VolumeChangeRequest,
   ChapterNavigationRequest,
   PlaybackSession,
   PlaybackUpdate,
   SUPPORTED_SPEEDS,
   PlaybackSpeed,
   PlaybackStats,
} from '../../models/PlaybackDto';

describe('PlaybackDto', () => {
   // Mock factories
   const createMockPlaybackState = (overrides = {}): PlaybackState => {
      const base: any = {
         isPlaying: false,
         currentPosition: 0,
         playbackSpeed: 1.0,
         volume: 100,
         audiobookId: 'audiobook-id',
         userId: 'user-id',
         ...overrides,
      };
      return base;
   };

   const createMockPlaybackSession = (overrides = {}): PlaybackSession => {
      return {
         id: 'session-id',
         userId: 'user-id',
         audiobookId: 'audiobook-id',
         currentChapterId: 'chapter-id',
         currentPosition: 300,
         playbackSpeed: 1.5,
         volume: 75,
         isPlaying: true,
         lastUpdated: new Date('2024-01-10'),
         sessionDuration: 1800,
         ...overrides,
      };
   };

   const createMockPlaybackUpdate = (overrides = {}): PlaybackUpdate => {
      return {
         userId: 'user-id',
         audiobookId: 'audiobook-id',
         chapterId: 'chapter-id',
         position: 600,
         timestamp: new Date('2024-01-10'),
         action: 'play',
         ...overrides,
      };
   };

   describe('SUPPORTED_SPEEDS constant', () => {
      it('should have correct values', () => {
         expect(SUPPORTED_SPEEDS).toContain(0.5);
         expect(SUPPORTED_SPEEDS).toContain(0.75);
         expect(SUPPORTED_SPEEDS).toContain(1.0);
         expect(SUPPORTED_SPEEDS).toContain(1.25);
         expect(SUPPORTED_SPEEDS).toContain(1.5);
         expect(SUPPORTED_SPEEDS).toContain(1.75);
         expect(SUPPORTED_SPEEDS).toContain(2.0);
      });

      it('should have length of 7', () => {
         expect(SUPPORTED_SPEEDS.length).toBe(7);
      });

      it('should be readonly', () => {
         // Verify SUPPORTED_SPEEDS is readonly array
         expect(Array.isArray(SUPPORTED_SPEEDS)).toBe(true);
      });
   });

   describe('PlaybackState', () => {
      it('should create valid PlaybackState', () => {
         const state = createMockPlaybackState();

         expect(state.isPlaying).toBe(false);
         expect(state.currentPosition).toBe(0);
         expect(state.playbackSpeed).toBe(1.0);
         expect(state.volume).toBe(100);
         expect(state.audiobookId).toBe('audiobook-id');
         expect(state.userId).toBe('user-id');
      });

      it('should handle playing state', () => {
         const state = createMockPlaybackState({ isPlaying: true });
         expect(state.isPlaying).toBe(true);
      });

      it('should handle current chapter', () => {
         const state = createMockPlaybackState({
            currentChapterId: 'chapter-id',
         });
         expect(state.currentChapterId).toBe('chapter-id');
      });

      it('should handle optional currentChapterId', () => {
         const state = createMockPlaybackState({
            currentChapterId: undefined,
         });
         expect(state.currentChapterId).toBeUndefined();
      });

      it('should handle different playback speeds', () => {
         const speeds: PlaybackSpeed[] = [0.5, 1.0, 1.5, 2.0];

         speeds.forEach((speed) => {
            const state = createMockPlaybackState({ playbackSpeed: speed });
            expect(state.playbackSpeed).toBe(speed);
         });
      });

      it('should handle volume ranges', () => {
         for (let vol = 0; vol <= 100; vol += 25) {
            const state = createMockPlaybackState({ volume: vol });
            expect(state.volume).toBe(vol);
         }
      });

      it('should handle various positions', () => {
         const positions = [0, 60, 300, 3600, 99999];

         positions.forEach((position) => {
            const state = createMockPlaybackState({ currentPosition: position });
            expect(state.currentPosition).toBe(position);
         });
      });
   });

   describe('PlaybackSyncRequest', () => {
      it('should create play action', () => {
         const request: PlaybackSyncRequest = {
            audiobookId: 'audiobook-id',
            action: 'play',
         };

         expect(request.action).toBe('play');
         expect(request.audiobookId).toBe('audiobook-id');
      });

      it('should create pause action', () => {
         const request: PlaybackSyncRequest = {
            audiobookId: 'audiobook-id',
            action: 'pause',
         };

         expect(request.action).toBe('pause');
      });

      it('should create seek action with position', () => {
         const request: PlaybackSyncRequest = {
            audiobookId: 'audiobook-id',
            action: 'seek',
            position: 300,
         };

         expect(request.action).toBe('seek');
         expect(request.position).toBe(300);
      });

      it('should handle optional chapterId for seek', () => {
         const request: PlaybackSyncRequest = {
            audiobookId: 'audiobook-id',
            action: 'seek',
            position: 600,
            chapterId: 'chapter-id',
         };

         expect(request.chapterId).toBe('chapter-id');
      });
   });

   describe('PlaybackControlRequest', () => {
      it('should create play control request', () => {
         const request: PlaybackControlRequest = {
            action: 'play',
            audiobookId: 'audiobook-id',
         };

         expect(request.action).toBe('play');
      });

      it('should create stop control request', () => {
         const request: PlaybackControlRequest = {
            action: 'stop',
            audiobookId: 'audiobook-id',
         };

         expect(request.action).toBe('stop');
      });

      it('should create seek control request with position', () => {
         const request: PlaybackControlRequest = {
            action: 'seek',
            audiobookId: 'audiobook-id',
            position: 1200,
         };

         expect(request.position).toBe(1200);
      });

      it('should create speed control request', () => {
         const request: PlaybackControlRequest = {
            action: 'speed',
            audiobookId: 'audiobook-id',
            speed: 1.5,
         };

         expect(request.speed).toBe(1.5);
      });

      it('should create volume control request', () => {
         const request: PlaybackControlRequest = {
            action: 'volume',
            audiobookId: 'audiobook-id',
            volume: 75,
         };

         expect(request.volume).toBe(75);
      });

      it('should create chapter navigation control request', () => {
         const request: PlaybackControlRequest = {
            action: 'seek',
            audiobookId: 'audiobook-id',
            chapterId: 'chapter-id',
            position: 0,
         };

         expect(request.chapterId).toBe('chapter-id');
      });
   });

   describe('SeekRequest', () => {
      it('should create seek request', () => {
         const request: SeekRequest = {
            position: 600,
         };

         expect(request.position).toBe(600);
      });

      it('should handle optional chapterId', () => {
         const request: SeekRequest = {
            position: 300,
            chapterId: 'chapter-id',
         };

         expect(request.chapterId).toBe('chapter-id');
      });

      it('should handle zero position', () => {
         const request: SeekRequest = { position: 0 };
         expect(request.position).toBe(0);
      });
   });

   describe('SpeedChangeRequest', () => {
      it('should create speed change request', () => {
         const request: SpeedChangeRequest = {
            speed: 1.25,
         };

         expect(request.speed).toBe(1.25);
      });

      it('should handle all supported speeds', () => {
         SUPPORTED_SPEEDS.forEach((speed) => {
            const request: SpeedChangeRequest = { speed };
            expect(request.speed).toBe(speed);
         });
      });
   });

   describe('VolumeChangeRequest', () => {
      it('should create volume change request', () => {
         const request: VolumeChangeRequest = {
            volume: 75,
         };

         expect(request.volume).toBe(75);
      });

      it('should handle volume ranges 0-100', () => {
         for (let vol = 0; vol <= 100; vol += 25) {
            const request: VolumeChangeRequest = { volume: vol };
            expect(request.volume).toBe(vol);
         }
      });
   });

   describe('ChapterNavigationRequest', () => {
      it('should create chapter navigation request', () => {
         const request: ChapterNavigationRequest = {
            audiobookId: 'audiobook-id',
            chapterId: 'chapter-id',
         };

         expect(request.audiobookId).toBe('audiobook-id');
         expect(request.chapterId).toBe('chapter-id');
      });

      it('should handle optional position', () => {
         const request: ChapterNavigationRequest = {
            audiobookId: 'audiobook-id',
            chapterId: 'chapter-id',
            position: 120,
         };

         expect(request.position).toBe(120);
      });

      it('should handle position at start of chapter', () => {
         const request: ChapterNavigationRequest = {
            audiobookId: 'audiobook-id',
            chapterId: 'chapter-id',
            position: 0,
         };

         expect(request.position).toBe(0);
      });
   });

   describe('PlaybackSession', () => {
      it('should create valid PlaybackSession', () => {
         const session = createMockPlaybackSession();

         expect(session.id).toBe('session-id');
         expect(session.userId).toBe('user-id');
         expect(session.audiobookId).toBe('audiobook-id');
         expect(session.currentChapterId).toBe('chapter-id');
         expect(session.currentPosition).toBe(300);
         expect(session.playbackSpeed).toBe(1.5);
         expect(session.volume).toBe(75);
         expect(session.isPlaying).toBe(true);
         expect(session.lastUpdated).toBeInstanceOf(Date);
         expect(session.sessionDuration).toBe(1800);
      });

      it('should handle optional currentChapterId', () => {
         const session = createMockPlaybackSession({
            currentChapterId: undefined,
         });

         expect(session.currentChapterId).toBeUndefined();
      });

      it('should handle different session durations', () => {
         const durations = [0, 60, 1800, 3600, 7200];

         durations.forEach((duration) => {
            const session = createMockPlaybackSession({ sessionDuration: duration });
            expect(session.sessionDuration).toBe(duration);
         });
      });
   });

   describe('PlaybackUpdate', () => {
      it('should create play update', () => {
         const update = createMockPlaybackUpdate({ action: 'play' });
         expect(update.action).toBe('play');
      });

      it('should create pause update', () => {
         const update = createMockPlaybackUpdate({ action: 'pause' });
         expect(update.action).toBe('pause');
      });

      it('should create seek update', () => {
         const update = createMockPlaybackUpdate({ action: 'seek' });
         expect(update.action).toBe('seek');
      });

      it('should create speed_change update', () => {
         const update = createMockPlaybackUpdate({ action: 'speed_change' });
         expect(update.action).toBe('speed_change');
      });

      it('should create volume_change update', () => {
         const update = createMockPlaybackUpdate({ action: 'volume_change' });
         expect(update.action).toBe('volume_change');
      });

      it('should create chapter_change update', () => {
         const update = createMockPlaybackUpdate({ action: 'chapter_change' });
         expect(update.action).toBe('chapter_change');
      });

      it('should handle optional chapterId', () => {
         const update = createMockPlaybackUpdate({ chapterId: undefined });
         expect(update.chapterId).toBeUndefined();
      });
   });

   describe('PlaybackStats', () => {
      it('should create valid PlaybackStats', () => {
         const stats: PlaybackStats = {
            totalListeningTime: 360000, // 100 hours in seconds
            averageSessionDuration: 1800, // 30 minutes
            mostUsedSpeed: 1.0,
            chaptersCompleted: 5,
            totalChapters: 10,
            completionPercentage: 50,
         };

         expect(stats.totalListeningTime).toBe(360000);
         expect(stats.averageSessionDuration).toBe(1800);
         expect(stats.mostUsedSpeed).toBe(1.0);
         expect(stats.chaptersCompleted).toBe(5);
         expect(stats.totalChapters).toBe(10);
         expect(stats.completionPercentage).toBe(50);
      });

      it('should handle 100% completion', () => {
         const stats: PlaybackStats = {
            totalListeningTime: 18000,
            averageSessionDuration: 600,
            mostUsedSpeed: 1.5,
            chaptersCompleted: 10,
            totalChapters: 10,
            completionPercentage: 100,
         };

         expect(stats.completionPercentage).toBe(100);
         expect(stats.chaptersCompleted).toBe(stats.totalChapters);
      });

      it('should handle zero listening time', () => {
         const stats: PlaybackStats = {
            totalListeningTime: 0,
            averageSessionDuration: 0,
            mostUsedSpeed: 1.0,
            chaptersCompleted: 0,
            totalChapters: 5,
            completionPercentage: 0,
         };

         expect(stats.totalListeningTime).toBe(0);
         expect(stats.completionPercentage).toBe(0);
      });
   });

   describe('Edge cases', () => {
      it('should handle negative position values', () => {
         const state = createMockPlaybackState({ currentPosition: -100 });
         expect(state.currentPosition).toBe(-100);
      });

      it('should handle very large position values', () => {
         const state = createMockPlaybackState({ currentPosition: 999999 });
         expect(state.currentPosition).toBe(999999);
      });

      it('should handle volume outside 0-100 range', () => {
         const state = createMockPlaybackState({ volume: 150 });
         expect(state.volume).toBe(150);
      });

      it('should handle speed outside supported range', () => {
         const state = createMockPlaybackState({ playbackSpeed: 0.3 });
         expect(state.playbackSpeed).toBe(0.3);
      });
   });
});

