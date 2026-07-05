import sizeOf from 'image-size';
import fs from 'fs';
import { ImageCategory, PrismaClient } from '@prisma/client';
import { ApiError } from '../types/ApiError';
import { APP_PRIMARY_VARIANT_KEYS } from '../constants/imagePlaceholderSpecs';

export interface RecommendedMaxSpec {
   width: number;
   height: number;
   aspectRatioWidth: number;
   aspectRatioHeight: number;
   primaryVariantKey: string;
}

export class ImageSpecService {
   constructor(private readonly prisma: PrismaClient) {}

   async getSpecsByCategory(category: ImageCategory) {
      return this.prisma.imagePlaceholderSpec.findMany({
         where: { category },
         orderBy: [{ actualWidth: 'desc' }, { actualHeight: 'desc' }],
      });
   }

   async getRecommendedMax(category: ImageCategory): Promise<RecommendedMaxSpec> {
      const spec = await this.prisma.imagePlaceholderSpec.findFirst({
         where: { category },
      });

      if (!spec) {
         throw ApiError.internalError(`No image specs configured for category: ${category}`);
      }

      const primaryVariantKey = APP_PRIMARY_VARIANT_KEYS[category];
      const primary = await this.prisma.imagePlaceholderSpec.findUnique({
         where: {
            category_variantKey: { category, variantKey: primaryVariantKey },
         },
      });

      return {
         width: spec.recommendedMaxWidth,
         height: spec.recommendedMaxHeight,
         aspectRatioWidth: primary?.aspectRatioWidth ?? spec.aspectRatioWidth,
         aspectRatioHeight: primary?.aspectRatioHeight ?? spec.aspectRatioHeight,
         primaryVariantKey,
      };
   }

   async validateUpload(category: ImageCategory, filePath: string): Promise<void> {
      const buffer = fs.readFileSync(filePath);
      const dimensions = sizeOf(buffer);

      if (!dimensions.width || !dimensions.height) {
         throw ApiError.validationError('Unable to read image dimensions');
      }

      const recommended = await this.getRecommendedMax(category);
      const { width, height } = dimensions;

      if (width < recommended.width || height < recommended.height) {
         throw ApiError.validationError(
            `Image must be at least ${recommended.width}×${recommended.height}px. Received ${width}×${height}px.`
         );
      }

      const targetAspect = recommended.aspectRatioWidth / recommended.aspectRatioHeight;
      const actualAspect = width / height;
      const tolerance = 0.02;

      if (Math.abs(actualAspect - targetAspect) > tolerance) {
         throw ApiError.validationError(
            `Image aspect ratio must be ${recommended.aspectRatioWidth}:${recommended.aspectRatioHeight}. Received ${width}×${height}px.`
         );
      }
   }
}
