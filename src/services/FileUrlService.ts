/**
 * Resolves stored file paths/keys to client-facing URLs.
 * Development: returns local /uploads/... paths.
 * Non-development: returns AWS presigned GET URLs.
 */
import fs from 'fs';
import path from 'path';
import { config } from '../config/env';
import { getFileUrl } from '../middleware/UploadMiddleware';
import { StorageFactory } from './storage/StorageFactory';
import { ImageCategory } from '@prisma/client';
import { AudioBookDto } from '../models/AudioBookDto';
import { ChapterWithRelations } from '../models/ChapterDto';
import { prisma } from '../lib/prisma';
import { ImageAssetService } from './ImageAssetService';

export type ImageKeyDirectory =
   | 'uploads/images/audiobooks'
   | 'uploads/images/chapters'
   | 'uploads/images/authors'
   | 'uploads/images/users'
   | 'uploads/images/organizations';

export class FileUrlService {
   private _imageAssetService: ImageAssetService | undefined;

   private get imageAssetService(): ImageAssetService {
      if (!this._imageAssetService) {
         this._imageAssetService = new ImageAssetService(prisma);
      }
      return this._imageAssetService;
   }

   shouldSignUrls(): boolean {
      return config.NODE_ENV !== 'development';
   }

   /**
    * Decode a stored value or URL into an S3 object key, if applicable.
    */
   normalizeToS3Key(stored: string): string | null {
      const trimmed = stored.trim();
      if (!trimmed) {
         return null;
      }

      if (trimmed.startsWith('file://')) {
         return null;
      }

      if (trimmed.startsWith('/uploads/')) {
         return trimmed.slice(1);
      }

      if (trimmed.startsWith('uploads/')) {
         return trimmed.replace(/\\/g, '/');
      }

      if (/^https?:\/\//i.test(trimmed)) {
         return this.extractKeyFromHttpUrl(trimmed);
      }

      // Legacy absolute filesystem paths from multer — not signable
      if (path.isAbsolute(trimmed) || /^[A-Za-z]:\\/.test(trimmed)) {
         return null;
      }

      return trimmed.replace(/\\/g, '/');
   }

   private extractKeyFromHttpUrl(urlString: string): string | null {
      try {
         const url = new URL(urlString);
         const pathname = decodeURIComponent(url.pathname.replace(/^\/+/, ''));

         if (config.AWS_S3_BUCKET && pathname.startsWith(`${config.AWS_S3_BUCKET}/`)) {
            return pathname.slice(config.AWS_S3_BUCKET.length + 1);
         }

         if (config.AWS_S3_ENDPOINT) {
            const endpointHost = new URL(config.AWS_S3_ENDPOINT).host;
            if (url.host === endpointHost && pathname.startsWith(`${config.AWS_S3_BUCKET}/`)) {
               return pathname.slice(config.AWS_S3_BUCKET.length + 1);
            }
         }

         // Virtual-hosted-style: bucket.s3.region.amazonaws.com/key
         if (url.hostname.startsWith(`${config.AWS_S3_BUCKET}.`)) {
            return pathname;
         }

         return null;
      } catch {
         return null;
      }
   }

   private isExternalHttpUrl(value: string): boolean {
      if (!/^https?:\/\//i.test(value)) {
         return false;
      }
      return this.normalizeToS3Key(value) === null;
   }

   async resolveForClient(stored?: string | null): Promise<string | undefined> {
      if (!stored) {
         return undefined;
      }

      const trimmed = stored.trim();
      if (!trimmed) {
         return undefined;
      }

      if (this.isExternalHttpUrl(trimmed)) {
         return trimmed;
      }

      if (!this.shouldSignUrls()) {
         if (trimmed.startsWith('/uploads/')) {
            return trimmed;
         }
         return getFileUrl(trimmed);
      }

      const key = this.normalizeToS3Key(trimmed);
      if (!key) {
         return trimmed;
      }

      const storageProvider = StorageFactory.getStorageProvider();
      return storageProvider.getFileUrl(key, config.AWS_SIGNED_URL_EXPIRES_IN);
   }

   async resolveManyForClient(
      values: (string | undefined | null)[]
   ): Promise<(string | undefined)[]> {
      return Promise.all(values.map(value => this.resolveForClient(value)));
   }

   async uploadLocalFileToStorage(
      localPath: string,
      s3Key: string,
      contentType: string
   ): Promise<string> {
      const fileBuffer = fs.readFileSync(localPath);
      const storageProvider = StorageFactory.getStorageProvider();
      await storageProvider.uploadFile(s3Key, fileBuffer, contentType);
      return s3Key.replace(/\\/g, '/');
   }

   /**
    * Process a multer-saved image: dev → /uploads/ URL; non-dev → S3 key.
    */
   async processUploadedImageFile(
      localPath: string,
      keyDirectory: ImageKeyDirectory,
      contentType = 'image/jpeg',
      filenamePrefix = 'image'
   ): Promise<string> {
      if (!this.shouldSignUrls()) {
         return getFileUrl(localPath);
      }

      const ext = path.extname(localPath) || '.jpg';
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const s3Key = `${keyDirectory}/${filenamePrefix}-${uniqueSuffix}${ext}`;

      return this.uploadLocalFileToStorage(localPath, s3Key, contentType);
   }

   /**
    * Process a multer-saved cover image: dev → /uploads/ URL; non-dev → S3 key.
    */
   async processUploadedCoverFile(
      localPath: string,
      keyDirectory: 'uploads/images/audiobooks' | 'uploads/images/chapters',
      contentType = 'image/jpeg'
   ): Promise<string> {
      return this.processUploadedImageFile(localPath, keyDirectory, contentType, 'cover');
   }

   async resolveAudioBookMedia<T extends AudioBookDto>(dto: T): Promise<T & { imageAssets: Record<string, string> }> {
      const coverImage = await this.resolveForClient(dto.coverImage);
      const imageAssets = await this.resolveImageAssets('audiobook', dto.id);
      return {
         ...dto,
         ...(coverImage !== undefined ? { coverImage } : {}),
         imageAssets,
      } as T & { imageAssets: Record<string, string> };
   }

   async resolveAudioBookMediaList<T extends AudioBookDto>(dtos: T[]): Promise<(T & { imageAssets: Record<string, string> })[]> {
      return Promise.all(dtos.map(dto => this.resolveAudioBookMedia(dto)));
   }

   async resolveChapterMedia(chapter: ChapterWithRelations): Promise<ChapterWithRelations & { imageAssets: Record<string, string> }> {
      const [filePath, coverImage] = await this.resolveManyForClient([
         chapter.filePath,
         chapter.coverImage,
      ]);

      const imageAssets = await this.resolveImageAssets('chapter', chapter.id);
      const resolvedCover = coverImage ?? chapter.coverImage;

      return {
         ...chapter,
         filePath: (filePath ?? chapter.filePath) ?? null,
         imageAssets,
         ...(resolvedCover ? { coverImage: resolvedCover } : {}),
      };
   }

   async resolveChapterMediaList(chapters: ChapterWithRelations[]): Promise<(ChapterWithRelations & { imageAssets: Record<string, string> })[]> {
      return Promise.all(chapters.map(chapter => this.resolveChapterMedia(chapter)));
   }

   async resolveNestedAudiobookMedia(
      audiobook: { id: string; coverImage?: string | null }
   ): Promise<{ coverImage?: string | null; imageAssets: Record<string, string> }> {
      const coverImage = await this.resolveForClient(audiobook.coverImage);
      const imageAssets = await this.resolveImageAssets('audiobook', audiobook.id);
      return {
         ...(coverImage !== undefined ? { coverImage } : {}),
         imageAssets,
      };
   }

   /** @deprecated Use resolveNestedAudiobookMedia */
   async resolveNestedAudiobookCoverImage(
      audiobook: { coverImage?: string | null }
   ): Promise<{ coverImage?: string | null }> {
      const coverImage = await this.resolveForClient(audiobook.coverImage);
      if (coverImage === undefined) {
         return {};
      }
      return { coverImage };
   }

   async resolveCommentUserMedia(
      _userId: string,
      profile: {
         username: string;
         avatar: string | null;
         imageAssets?: Record<string, string>;
      },
   ): Promise<{ username: string; avatar: string | null; imageAssets: Record<string, string> }> {
      const avatar = (await this.resolveForClient(profile.avatar)) ?? profile.avatar;
      const imageAssets = profile.imageAssets ?? {};
      return {
         username: profile.username,
         avatar,
         imageAssets,
      };
   }

   private async resolveImageAssets(
      category: ImageCategory,
      entityId: string,
   ): Promise<Record<string, string>> {
      return this.imageAssetService.resolveAssetsForClient(category, entityId);
   }

   async resolveImageAssetsForEntity(
      category: ImageCategory,
      entityId: string,
   ): Promise<Record<string, string>> {
      return this.resolveImageAssets(category, entityId);
   }
}

export const fileUrlService = new FileUrlService();
