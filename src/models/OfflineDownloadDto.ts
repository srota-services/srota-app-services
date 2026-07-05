/**
 * Offline Download Data Transfer Objects
 * Defines the structure for offline download functionality
 */

import { DownloadStatus } from '@prisma/client';

// Base OfflineDownload interface
export interface OfflineDownloadData {
   id: string;
   userId: string;
   audiobookId: string;
   status: DownloadStatus;
   progress: number; // Download progress percentage (0-100)
   filePath?: string;
   fileSize?: number;
   errorMessage?: string;
   retryCount: number;
   createdAt: Date;
   updatedAt: Date;
   completedAt?: Date;
}

// OfflineDownload with relations
export interface OfflineDownloadWithRelations extends OfflineDownloadData {
   audiobook: {
      id: string;
      title: string;
      author: string;
      duration: number;
      fileSize: bigint;
      coverImage?: string;
      imageAssets?: Record<string, string>;
   };
}

// Download request
export interface DownloadRequest {
   audiobookId: string;
   quality?: 'high' | 'medium' | 'low'; // Optional quality setting
}

// Download status update
export interface DownloadStatusUpdate {
   status: DownloadStatus;
   progress?: number;
   filePath?: string;
   fileSize?: number;
   errorMessage?: string;
   retryCount?: number;
}

// Download progress response
export interface DownloadProgress {
   downloadId: string;
   audiobookId: string;
   audiobookTitle: string;
   status: DownloadStatus;
   progress: number;
   fileSize?: number;
   downloadedSize?: number;
   estimatedTimeRemaining?: number; // In seconds
   downloadSpeed?: number; // Bytes per second
   errorMessage?: string;
}

// Download queue status
export interface DownloadQueueStatus {
   pending: number;
   inProgress: number;
   completed: number;
   failed: number;
   total: number;
}

// Download settings
export interface DownloadSettings {
   maxConcurrentDownloads: number;
   downloadQuality: 'high' | 'medium' | 'low';
   autoDownloadOnWifi: boolean;
   downloadLocation: string;
   maxStorageUsage: number; // In MB
}

// Download statistics
export interface DownloadStats {
   totalDownloads: number;
   successfulDownloads: number;
   failedDownloads: number;
   totalDownloadedSize: number; // In bytes
   averageDownloadTime: number; // In seconds
   downloadsByStatus: Array<{
      status: DownloadStatus;
      count: number;
   }>;
}

// Download job data for Bull queue
export interface DownloadJobData {
   userId: string;
   audiobookId: string;
   downloadId: string;
   quality?: 'high' | 'medium' | 'low';
   retryCount?: number;
}
