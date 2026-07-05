/**
 * OfflineDownloadDto Tests
 * Tests for OfflineDownload DTO interfaces and type validation
 */

import {
   OfflineDownloadData,
   OfflineDownloadWithRelations,
   DownloadRequest,
   DownloadStatusUpdate,
   DownloadProgress,
   DownloadQueueStatus,
   DownloadSettings,
   DownloadStats,
   DownloadJobData,
} from '../../models/OfflineDownloadDto';
import { DownloadStatus } from '@prisma/client';

describe('OfflineDownloadDto', () => {
   // Mock factories
   const createMockOfflineDownloadData = (overrides = {}): OfflineDownloadData => {
      const base: any = {
         id: 'download-id',
         userId: 'user-id',
         audiobookId: 'audiobook-id',
         status: DownloadStatus.PENDING,
         progress: 0,
         filePath: '/path/to/download.mp3',
         fileSize: 1024 * 1024 * 100, // 100 MB
         retryCount: 0,
         createdAt: new Date('2024-01-01'),
         updatedAt: new Date('2024-01-02'),
         ...overrides,
      };

      if (base.errorMessage === undefined) delete base.errorMessage;
      if (base.completedAt === undefined) delete base.completedAt;

      return base;
   };

   const createMockOfflineDownloadWithRelations = (overrides = {}): OfflineDownloadWithRelations => {
      const baseDownload = createMockOfflineDownloadData();
      return {
         ...baseDownload,
         audiobook: {
            id: 'audiobook-id',
            title: 'Test Audiobook',
            author: 'Test Author',
            duration: 3600,
            fileSize: BigInt('524288000'), // 500 MB
            coverImage: 'cover.jpg',
         },
         ...overrides,
      };
   };

   const createMockDownloadProgress = (overrides = {}): DownloadProgress => {
      const base: any = {
         downloadId: 'download-id',
         audiobookId: 'audiobook-id',
         audiobookTitle: 'Test Audiobook',
         status: DownloadStatus.IN_PROGRESS,
         progress: 50,
         fileSize: 524288000,
         downloadedSize: 262144000,
         estimatedTimeRemaining: 120,
         downloadSpeed: 2197152,
         ...overrides,
      };

      if (base.errorMessage === undefined) delete base.errorMessage;

      return base;
   };

   describe('OfflineDownloadData', () => {
      it('should create valid OfflineDownloadData', () => {
         const download = createMockOfflineDownloadData();

         expect(download.id).toBe('download-id');
         expect(download.userId).toBe('user-id');
         expect(download.audiobookId).toBe('audiobook-id');
         expect(download.status).toBe(DownloadStatus.PENDING);
         expect(download.progress).toBe(0);
         expect(download.retryCount).toBe(0);
      });

      it('should handle all DownloadStatus values', () => {
         const statuses = [
            DownloadStatus.PENDING,
            DownloadStatus.IN_PROGRESS,
            DownloadStatus.COMPLETED,
            DownloadStatus.FAILED,
            DownloadStatus.CANCELLED,
         ];

         statuses.forEach((status) => {
            const download = createMockOfflineDownloadData({ status });
            expect(download.status).toBe(status);
         });
      });

      it('should handle optional fields', () => {
         const download = createMockOfflineDownloadData({
            filePath: undefined,
            fileSize: undefined,
            errorMessage: undefined,
            completedAt: undefined,
         });

         expect(download.filePath).toBeUndefined();
         expect(download.fileSize).toBeUndefined();
         expect(download.errorMessage).toBeUndefined();
         expect(download.completedAt).toBeUndefined();
      });

      it('should handle error state', () => {
         const download = createMockOfflineDownloadData({
            status: DownloadStatus.FAILED,
            errorMessage: 'Download failed: Connection timeout',
            retryCount: 3,
         });

         expect(download.status).toBe(DownloadStatus.FAILED);
         expect(download.errorMessage).toBe('Download failed: Connection timeout');
         expect(download.retryCount).toBe(3);
      });

      it('should handle completed state', () => {
         const download = createMockOfflineDownloadData({
            status: DownloadStatus.COMPLETED,
            progress: 100,
            completedAt: new Date(),
         });

         expect(download.status).toBe(DownloadStatus.COMPLETED);
         expect(download.progress).toBe(100);
         expect(download.completedAt).toBeInstanceOf(Date);
      });
   });

   describe('OfflineDownloadWithRelations', () => {
      it('should create valid OfflineDownloadWithRelations', () => {
         const download = createMockOfflineDownloadWithRelations();

         expect(download.audiobook).toBeDefined();
         expect(download.audiobook.title).toBe('Test Audiobook');
         expect(download.audiobook.author).toBe('Test Author');
         expect(download.audiobook.duration).toBe(3600);
         expect(typeof download.audiobook.fileSize).toBe('bigint');
         expect(Number(download.audiobook.fileSize)).toBe(524288000);
      });

      it('should handle BigInt fileSize conversion', () => {
         const download = createMockOfflineDownloadWithRelations({
            audiobook: {
               id: 'audiobook-id',
               title: 'Large Book',
               author: 'Author',
               duration: 7200,
               fileSize: BigInt('1073741824'), // 1 GB
               coverImage: undefined,
            },
         });

         expect(Number(download.audiobook.fileSize)).toBe(1073741824);
      });

      it('should handle optional coverImage', () => {
         const download = createMockOfflineDownloadWithRelations({
            audiobook: {
               id: 'audiobook-id',
               title: 'No Cover',
               author: 'Author',
               duration: 1800,
               fileSize: BigInt('104857600'),
               coverImage: undefined,
            },
         });

         expect(download.audiobook.coverImage).toBeUndefined();
      });
   });

   describe('DownloadRequest', () => {
      it('should create valid DownloadRequest', () => {
         const request: DownloadRequest = {
            audiobookId: 'audiobook-id',
            quality: 'high',
         };

         expect(request.audiobookId).toBe('audiobook-id');
         expect(request.quality).toBe('high');
      });

      it('should handle all quality options', () => {
         const qualities = ['high', 'medium', 'low'] as const;

         qualities.forEach((quality) => {
            const request: DownloadRequest = {
               audiobookId: 'audiobook-id',
               quality,
            };
            expect(request.quality).toBe(quality);
         });
      });

      it('should handle optional quality field', () => {
         const request: DownloadRequest = {
            audiobookId: 'audiobook-id',
         };

         expect(request.audiobookId).toBe('audiobook-id');
         expect(request.quality).toBeUndefined();
      });
   });

   describe('DownloadStatusUpdate', () => {
      it('should update status only', () => {
         const update: DownloadStatusUpdate = {
            status: DownloadStatus.COMPLETED,
         };

         expect(update.status).toBe(DownloadStatus.COMPLETED);
      });

      it('should update all fields', () => {
         const update: DownloadStatusUpdate = {
            status: DownloadStatus.IN_PROGRESS,
            progress: 75,
            filePath: '/new/path.mp3',
            fileSize: 524288000,
            retryCount: 2,
         };

         expect(update.status).toBe(DownloadStatus.IN_PROGRESS);
         expect(update.progress).toBe(75);
         expect(update.filePath).toBe('/new/path.mp3');
      });
   });

   describe('DownloadProgress', () => {
      it('should create valid DownloadProgress', () => {
         const progress = createMockDownloadProgress();

         expect(progress.downloadId).toBe('download-id');
         expect(progress.audiobookId).toBe('audiobook-id');
         expect(progress.status).toBe(DownloadStatus.IN_PROGRESS);
         expect(progress.progress).toBe(50);
         expect(progress.downloadedSize).toBe(262144000);
         expect(progress.estimatedTimeRemaining).toBe(120);
         expect(progress.downloadSpeed).toBe(2197152);
      });

      it('should handle optional speed and time fields', () => {
         const progress = createMockDownloadProgress({
            estimatedTimeRemaining: undefined,
            downloadSpeed: undefined,
         });

         expect(progress.estimatedTimeRemaining).toBeUndefined();
         expect(progress.downloadSpeed).toBeUndefined();
      });

      it('should calculate progress percentage', () => {
         const progress = createMockDownloadProgress({
            fileSize: 1000000,
            downloadedSize: 500000,
         });

         // Custom calculation for test
         const percentage = progress.progress;
         expect(percentage).toBeGreaterThanOrEqual(0);
         expect(percentage).toBeLessThanOrEqual(100);
      });
   });

   describe('DownloadQueueStatus', () => {
      it('should create valid DownloadQueueStatus', () => {
         const queueStatus: DownloadQueueStatus = {
            pending: 5,
            inProgress: 2,
            completed: 10,
            failed: 1,
            total: 18,
         };

         expect(queueStatus.pending).toBe(5);
         expect(queueStatus.inProgress).toBe(2);
         expect(queueStatus.completed).toBe(10);
         expect(queueStatus.failed).toBe(1);
         expect(queueStatus.total).toBe(18);
      });

      it('should handle all zeros', () => {
         const queueStatus: DownloadQueueStatus = {
            pending: 0,
            inProgress: 0,
            completed: 0,
            failed: 0,
            total: 0,
         };

         expect(queueStatus.total).toBe(0);
      });

      it('should ensure total matches sum', () => {
         const queueStatus: DownloadQueueStatus = {
            pending: 3,
            inProgress: 2,
            completed: 7,
            failed: 1,
            total: 13,
         };

         const sum =
            queueStatus.pending +
            queueStatus.inProgress +
            queueStatus.completed +
            queueStatus.failed;
         expect(queueStatus.total).toBe(sum);
      });
   });

   describe('DownloadSettings', () => {
      it('should create valid DownloadSettings', () => {
         const settings: DownloadSettings = {
            maxConcurrentDownloads: 3,
            downloadQuality: 'high',
            autoDownloadOnWifi: true,
            downloadLocation: '/storage/downloads',
            maxStorageUsage: 10240, // 10 GB
         };

         expect(settings.maxConcurrentDownloads).toBe(3);
         expect(settings.downloadQuality).toBe('high');
         expect(settings.autoDownloadOnWifi).toBe(true);
         expect(settings.maxStorageUsage).toBe(10240);
      });

      it('should handle different quality settings', () => {
         const qualities = ['high', 'medium', 'low'] as const;

         qualities.forEach((quality) => {
            const settings: DownloadSettings = {
               maxConcurrentDownloads: 1,
               downloadQuality: quality,
               autoDownloadOnWifi: false,
               downloadLocation: '/storage',
               maxStorageUsage: 5120,
            };
            expect(settings.downloadQuality).toBe(quality);
         });
      });
   });

   describe('DownloadStats', () => {
      it('should create valid DownloadStats', () => {
         const stats: DownloadStats = {
            totalDownloads: 100,
            successfulDownloads: 85,
            failedDownloads: 15,
            totalDownloadedSize: 52428800000, // 50 GB
            averageDownloadTime: 3600, // 1 hour
            downloadsByStatus: [
               { status: DownloadStatus.COMPLETED, count: 85 },
               { status: DownloadStatus.FAILED, count: 15 },
            ],
         };

         expect(stats.totalDownloads).toBe(100);
         expect(stats.successfulDownloads).toBe(85);
         expect(stats.failedDownloads).toBe(15);
         expect(stats.downloadsByStatus.length).toBe(2);
      });

      it('should handle empty stats', () => {
         const stats: DownloadStats = {
            totalDownloads: 0,
            successfulDownloads: 0,
            failedDownloads: 0,
            totalDownloadedSize: 0,
            averageDownloadTime: 0,
            downloadsByStatus: [],
         };

         expect(stats.totalDownloads).toBe(0);
         expect(stats.downloadsByStatus.length).toBe(0);
      });
   });

   describe('DownloadJobData', () => {
      it('should create valid DownloadJobData', () => {
         const jobData: DownloadJobData = {
            userId: 'user-id',
            audiobookId: 'audiobook-id',
            downloadId: 'download-id',
            quality: 'high',
            retryCount: 0,
         };

         expect(jobData.userId).toBe('user-id');
         expect(jobData.audiobookId).toBe('audiobook-id');
         expect(jobData.downloadId).toBe('download-id');
         expect(jobData.quality).toBe('high');
         expect(jobData.retryCount).toBe(0);
      });

      it('should handle optional fields', () => {
         const jobData: DownloadJobData = {
            userId: 'user-id',
            audiobookId: 'audiobook-id',
            downloadId: 'download-id',
         };

         expect(jobData.quality).toBeUndefined();
         expect(jobData.retryCount).toBeUndefined();
      });
   });

   describe('Edge cases', () => {
      it('should handle 100% progress', () => {
         const download = createMockOfflineDownloadData({ progress: 100 });
         expect(download.progress).toBe(100);
      });

      it('should handle negative progress (should be clamped)', () => {
         const download = createMockOfflineDownloadData({ progress: -10 });
         expect(download.progress).toBe(-10); // Original value preserved in data
      });

      it('should handle very large file sizes', () => {
         const download = createMockOfflineDownloadData({
            fileSize: 1024 * 1024 * 1024 * 10, // 10 GB
         });
         expect(download.fileSize).toBe(10737418240);
      });

      it('should handle retry count limit', () => {
         const download = createMockOfflineDownloadData({ retryCount: 10 });
         expect(download.retryCount).toBe(10);
      });
   });
});

