/**
 * Playback Data Transfer Objects
 * Defines the structure for audiobook playback functionality
 */

// Playback state
export interface PlaybackState {
   isPlaying: boolean;
   currentPosition: number; // Position in seconds
   playbackSpeed: number; // 0.5x, 1x, 1.25x, 1.5x, 2x
   volume: number; // 0-100
   currentChapterId?: string;
   audiobookId: string;
   userId: string;
}

// Playback sync request - combines play, pause, and seek functionality
export interface PlaybackSyncRequest {
   audiobookId: string;
   action: 'play' | 'pause' | 'seek';
   position?: number; // For seek action
   chapterId?: string; // Optional chapter ID
}

// Playback control requests
export interface PlaybackControlRequest {
   action: 'play' | 'pause' | 'stop' | 'seek' | 'speed' | 'volume';
   audiobookId: string;
   position?: number; // For seek action
   speed?: number; // For speed change
   volume?: number; // For volume change
   chapterId?: string; // For chapter navigation
}

// Seek request
export interface SeekRequest {
   position: number; // Position in seconds
   chapterId?: string; // Optional chapter ID for chapter-specific seeking
}

// Speed change request
export interface SpeedChangeRequest {
   speed: number; // Playback speed multiplier
}

// Volume change request
export interface VolumeChangeRequest {
   volume: number; // Volume level 0-100
}

// Chapter navigation request
export interface ChapterNavigationRequest {
   audiobookId: string;
   chapterId: string;
   position?: number; // Optional starting position in the chapter
}

// Playback session data
export interface PlaybackSession {
   id: string;
   userId: string;
   audiobookId: string;
   currentChapterId?: string;
   currentPosition: number;
   playbackSpeed: number;
   volume: number;
   isPlaying: boolean;
   lastUpdated: Date;
   sessionDuration: number; // Total session duration in seconds
}

// Real-time playback update
export interface PlaybackUpdate {
   userId: string;
   audiobookId: string;
   chapterId?: string;
   position: number;
   timestamp: Date;
   action: 'play' | 'pause' | 'seek' | 'speed_change' | 'volume_change' | 'chapter_change';
}

// Supported playback speeds
export const SUPPORTED_SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0] as const;

export type PlaybackSpeed = typeof SUPPORTED_SPEEDS[number];

// Playback statistics
export interface PlaybackStats {
   totalListeningTime: number; // Total time spent listening in seconds
   averageSessionDuration: number; // Average session duration in seconds
   mostUsedSpeed: PlaybackSpeed;
   chaptersCompleted: number;
   totalChapters: number;
   completionPercentage: number;
}
