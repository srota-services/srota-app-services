/**
 * FileUrlService unit tests
 */
import { fileUrlService, FileUrlService } from '../../services/FileUrlService';
import { StorageFactory } from '../../services/storage/StorageFactory';

jest.mock('../../config/env', () => ({
   config: {
      NODE_ENV: 'testing',
      AWS_S3_BUCKET: 'test-bucket',
      AWS_S3_ENDPOINT: '',
      AWS_SIGNED_URL_EXPIRES_IN: 3600,
      DEV_UPLOAD_DIR: './src/uploads',
      AUTH_SERVICE_URL: 'http://localhost:8080',
   },
}));

jest.mock('../../middleware/UploadMiddleware', () => ({
   getFileUrl: (filePath: string) => `/uploads${filePath.replace('./src/uploads', '')}`,
}));

jest.mock('../../services/ImageAssetService', () => ({
   ImageAssetService: jest.fn().mockImplementation(() => ({
      resolveAssetsForClient: jest.fn().mockResolvedValue({}),
   })),
}));

describe('FileUrlService', () => {
   let service: FileUrlService;
   const mockGetFileUrl = jest.fn();

   beforeEach(() => {
      service = new FileUrlService();
      mockGetFileUrl.mockReset();
      mockGetFileUrl.mockResolvedValue('https://signed.example/object');

      jest.spyOn(StorageFactory, 'getStorageProvider').mockReturnValue({
         getFileUrl: mockGetFileUrl,
      } as never);
   });

   afterEach(() => {
      jest.restoreAllMocks();
   });

   describe('normalizeToS3Key', () => {
      it('returns uploads/ key as-is', () => {
         expect(service.normalizeToS3Key('uploads/chapters/audio-1.mp3')).toBe(
            'uploads/chapters/audio-1.mp3'
         );
      });

      it('strips leading /uploads/ prefix', () => {
         expect(service.normalizeToS3Key('/uploads/images/chapters/cover.jpg')).toBe(
            'uploads/images/chapters/cover.jpg'
         );
      });

      it('extracts key from virtual-hosted S3 URL', () => {
         expect(
            service.normalizeToS3Key(
               'https://test-bucket.s3.us-east-1.amazonaws.com/uploads/chapters/audio-1.mp3'
            )
         ).toBe('uploads/chapters/audio-1.mp3');
      });

      it('returns null for external HTTP URLs', () => {
         expect(service.normalizeToS3Key('https://cdn.example.com/image.jpg')).toBeNull();
      });
   });

   describe('resolveForClient', () => {
      it('presigns S3 keys in non-development environments', async () => {
         const url = await service.resolveForClient('uploads/chapters/audio-1.mp3');

         expect(mockGetFileUrl).toHaveBeenCalledWith('uploads/chapters/audio-1.mp3', 3600);
         expect(url).toBe('https://signed.example/object');
      });

      it('passes through external HTTP URLs unchanged', async () => {
         const external = 'https://cdn.example.com/image.jpg';
         const url = await service.resolveForClient(external);

         expect(mockGetFileUrl).not.toHaveBeenCalled();
         expect(url).toBe(external);
      });
   });

   describe('resolveAudioBookMedia', () => {
      it('resolves coverImage on audiobook DTOs', async () => {
         const result = await fileUrlService.resolveAudioBookMedia({
            id: 'ab-1',
            title: 'Title',
            author: 'Author',
            type: 'PUBLICATION',
            languageId: 'lang-en',
            isActive: true,
            isPublic: true,
            subscriptionGatingMode: 'NONE',
            minSubscriptionTier: null,
            owner: { type: 'ORGANIZATION', id: 'org-1' },
            createdAt: new Date(),
            updatedAt: new Date(),
            coverImage: 'uploads/images/audiobooks/cover-1.jpg',
         });

         expect(result.coverImage).toBe('https://signed.example/object');
      });
   });

   describe('resolveCommentUserMedia', () => {
      it('resolves avatar on comment user DTOs', async () => {
         const result = await fileUrlService.resolveCommentUserMedia('user-1', {
            username: 'jane',
            avatar: 'uploads/images/users/avatar-1.jpg',
         });

         expect(result.username).toBe('jane');
         expect(result.avatar).toBe('https://signed.example/object');
      });
   });

   describe('processUploadedImageFile', () => {
      it('uploads to S3 with custom key directory in non-development', async () => {
         const mockUploadFile = jest.fn().mockResolvedValue('uploads/images/authors/image-1.jpg');
         jest.spyOn(StorageFactory, 'getStorageProvider').mockReturnValue({
            uploadFile: mockUploadFile,
            getFileUrl: mockGetFileUrl,
         } as never);

         jest.spyOn(require('fs'), 'readFileSync').mockReturnValue(Buffer.from('data'));

         const result = await service.processUploadedImageFile(
            '/tmp/image.jpg',
            'uploads/images/authors',
            'image/jpeg'
         );

         expect(mockUploadFile).toHaveBeenCalled();
         expect(result).toMatch(/^uploads\/images\/authors\/image-/);
      });
   });
});
