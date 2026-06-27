import fs from 'fs';
import path from 'path';
import os from 'os';
import axios from 'axios';
import { ImageCategory, PrismaClient } from '@prisma/client';
import { config } from '../config/env';
import { ImageSpecService } from './ImageSpecService';
import { ImageProcessingService } from './ImageProcessingService';
import { StorageFactory } from './storage/StorageFactory';
import { fileUrlService } from './FileUrlService';
import { mediaCleanupService } from './MediaCleanupService';
import { APP_PRIMARY_VARIANT_KEYS } from '../constants/imagePlaceholderSpecs';
import { runInTransaction, runWrite } from '../utils/prismaTransaction';

async function writeBufferToTempFile(buffer: Buffer, suffix: string): Promise<string> {
   const tempPath = path.join(os.tmpdir(), `source-image-${Date.now()}${suffix}`);
   fs.writeFileSync(tempPath, buffer);
   return tempPath;
}

export interface GenerateVariantsResult {
   primaryStorageKey: string;
   variants: Record<string, string>;
}

export class ImageAssetService {
   private readonly specService: ImageSpecService;
   private readonly processingService: ImageProcessingService;

   constructor(private readonly prisma: PrismaClient) {
      this.specService = new ImageSpecService(prisma);
      this.processingService = new ImageProcessingService();
   }

   buildStorageKey(category: ImageCategory, entityId: string, variantKey: string): string {
      return `uploads/images/${category}/${entityId}/${variantKey}.jpg`;
   }

   buildDevPublicPath(storageKey: string): string {
      return `/${storageKey}`;
   }

   async deleteAssetsForEntity(category: ImageCategory, entityId: string): Promise<void> {
      const assets = await this.prisma.imageAsset.findMany({
         where: { category, entityId },
      });

      for (const asset of assets) {
         await mediaCleanupService.deleteStoredFile(asset.storageKey);
      }

      await runWrite(this.prisma, async (tx) =>
         tx.imageAsset.deleteMany({ where: { category, entityId } }),
      );
   }

   async validateUploadSource(category: ImageCategory, sourcePath: string): Promise<void> {
      await this.specService.validateUpload(category, sourcePath);
   }

   async generateAndStoreVariants(
      category: ImageCategory,
      entityId: string,
      sourcePath: string
   ): Promise<GenerateVariantsResult> {
      await this.specService.validateUpload(category, sourcePath);

      const existingAssets = await this.prisma.imageAsset.findMany({
         where: { category, entityId },
      });
      for (const asset of existingAssets) {
         await mediaCleanupService.deleteStoredFile(asset.storageKey);
      }

      const specs = await this.specService.getSpecsByCategory(category);
      const isDevelopment = config.NODE_ENV === 'development';
      const tempDir = isDevelopment
         ? path.join(config.DEV_UPLOAD_DIR, 'images', category, entityId)
         : path.join(os.tmpdir(), `image-variants-${entityId}-${Date.now()}`);

      fs.mkdirSync(tempDir, { recursive: true });

      const variants: Record<string, string> = {};
      const tempFiles: string[] = [];
      const upsertPayloads: Array<{
         variantKey: string;
         storageKey: string;
         width: number;
         height: number;
      }> = [];

      try {
         for (const spec of specs) {
            const outputPath = path.join(tempDir, `${spec.variantKey}.jpg`);
            await this.processingService.generateVariant(
               sourcePath,
               outputPath,
               spec.actualWidth,
               spec.actualHeight
            );
            tempFiles.push(outputPath);

            const storageKey = this.buildStorageKey(category, entityId, spec.variantKey);

            if (isDevelopment) {
               const devPath = path.join(config.DEV_UPLOAD_DIR, 'images', category, entityId, `${spec.variantKey}.jpg`);
               fs.mkdirSync(path.dirname(devPath), { recursive: true });
               fs.copyFileSync(outputPath, devPath);
               variants[spec.variantKey] = this.buildDevPublicPath(storageKey);
            } else {
               const storageProvider = StorageFactory.getStorageProvider();
               const fileBuffer = fs.readFileSync(outputPath);
               await storageProvider.uploadFile(storageKey, fileBuffer, 'image/jpeg');
               variants[spec.variantKey] = storageKey;
            }

            upsertPayloads.push({
               variantKey: spec.variantKey,
               storageKey: variants[spec.variantKey]!,
               width: spec.actualWidth,
               height: spec.actualHeight,
            });
         }

         await runInTransaction(this.prisma, async (tx) => {
            await tx.imageAsset.deleteMany({ where: { category, entityId } });
            for (const payload of upsertPayloads) {
               await tx.imageAsset.upsert({
                  where: {
                     category_entityId_variantKey: {
                        category,
                        entityId,
                        variantKey: payload.variantKey,
                     },
                  },
                  update: {
                     storageKey: payload.storageKey,
                     width: payload.width,
                     height: payload.height,
                  },
                  create: {
                     category,
                     entityId,
                     variantKey: payload.variantKey,
                     storageKey: payload.storageKey,
                     width: payload.width,
                     height: payload.height,
                  },
               });
            }
         });
      } finally {
         for (const file of tempFiles) {
            if (fs.existsSync(file)) {
               fs.unlinkSync(file);
            }
         }
         if (!isDevelopment && fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
         }
      }

      const primaryKey = APP_PRIMARY_VARIANT_KEYS[category];
      const primaryStorageKey = variants[primaryKey]!;

      return { primaryStorageKey, variants };
   }

   /**
    * Resolve a stored image reference (S3 key, /uploads path, or auth-service URL) to a local file path.
    */
   async resolveSourceImageToLocalPath(stored: string): Promise<string> {
      const trimmed = stored.trim();
      const key = fileUrlService.normalizeToS3Key(trimmed);

      if (config.NODE_ENV === 'development') {
         if (trimmed.startsWith('/uploads/')) {
            const localPath = path.join(config.DEV_UPLOAD_DIR, trimmed.replace('/uploads/', ''));
            if (fs.existsSync(localPath)) {
               return localPath;
            }
            const response = await axios.get<ArrayBuffer>(
               `${config.AUTH_SERVICE_URL.replace(/\/$/, '')}${trimmed}`,
               { responseType: 'arraybuffer' },
            );
            const buffer = Buffer.from(response.data);
            return writeBufferToTempFile(buffer, path.extname(trimmed) || '.jpg');
         }

         if (key) {
            const localPath = path.join(config.DEV_UPLOAD_DIR, key.startsWith('uploads/') ? key.slice('uploads/'.length) : key);
            if (fs.existsSync(localPath)) {
               return localPath;
            }
         }
      }

      if (key) {
         const storageProvider = StorageFactory.getStorageProvider();
         const buffer = await storageProvider.downloadFile(key);
         return writeBufferToTempFile(buffer, path.extname(key) || '.jpg');
      }

      throw new Error(`Unable to resolve source image: ${stored}`);
   }

   async resolveAssetsForClient(
      category: ImageCategory,
      entityId: string
   ): Promise<Record<string, string>> {
      const assets = await this.prisma.imageAsset.findMany({
         where: { category, entityId },
      });

      const resolved: Record<string, string> = {};
      for (const asset of assets) {
         const url = await fileUrlService.resolveForClient(asset.storageKey);
         if (url) {
            resolved[asset.variantKey] = url;
         }
      }
      return resolved;
   }
}

export function createImageAssetService(prisma: PrismaClient): ImageAssetService {
   return new ImageAssetService(prisma);
}
