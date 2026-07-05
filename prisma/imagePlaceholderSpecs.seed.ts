import { ImageCategory, PrismaClient } from '@prisma/client';

type SpecRow = {
   category: ImageCategory;
   variantKey: string;
   actualWidth: number;
   actualHeight: number;
   aspectRatioWidth: number;
   aspectRatioHeight: number;
   recommendedMaxWidth: number;
   recommendedMaxHeight: number;
};

const APP_IMAGE_SPECS: SpecRow[] = [
   // audiobook — recommended max 700×1000
   { category: 'audiobook', variantKey: 'square_64', actualWidth: 256, actualHeight: 256, aspectRatioWidth: 1, aspectRatioHeight: 1, recommendedMaxWidth: 700, recommendedMaxHeight: 1000 },
   { category: 'audiobook', variantKey: 'portrait_7_10', actualWidth: 700, actualHeight: 1000, aspectRatioWidth: 7, aspectRatioHeight: 10, recommendedMaxWidth: 700, recommendedMaxHeight: 1000 },
   { category: 'audiobook', variantKey: 'portrait_3_4', actualWidth: 600, actualHeight: 800, aspectRatioWidth: 3, aspectRatioHeight: 4, recommendedMaxWidth: 700, recommendedMaxHeight: 1000 },
   { category: 'audiobook', variantKey: 'square_56', actualWidth: 224, actualHeight: 224, aspectRatioWidth: 1, aspectRatioHeight: 1, recommendedMaxWidth: 700, recommendedMaxHeight: 1000 },
   { category: 'audiobook', variantKey: 'square_48', actualWidth: 192, actualHeight: 192, aspectRatioWidth: 1, aspectRatioHeight: 1, recommendedMaxWidth: 700, recommendedMaxHeight: 1000 },
   { category: 'audiobook', variantKey: 'square_88', actualWidth: 352, actualHeight: 352, aspectRatioWidth: 1, aspectRatioHeight: 1, recommendedMaxWidth: 700, recommendedMaxHeight: 1000 },
   // chapter — recommended max 960×960
   { category: 'chapter', variantKey: 'landscape_20_11', actualWidth: 800, actualHeight: 440, aspectRatioWidth: 20, aspectRatioHeight: 11, recommendedMaxWidth: 960, recommendedMaxHeight: 960 },
   { category: 'chapter', variantKey: 'square_56', actualWidth: 224, actualHeight: 224, aspectRatioWidth: 1, aspectRatioHeight: 1, recommendedMaxWidth: 960, recommendedMaxHeight: 960 },
   { category: 'chapter', variantKey: 'square_960', actualWidth: 960, actualHeight: 960, aspectRatioWidth: 1, aspectRatioHeight: 1, recommendedMaxWidth: 960, recommendedMaxHeight: 960 },
];

export async function seedImagePlaceholderSpecs(prisma: PrismaClient): Promise<void> {
   for (const row of APP_IMAGE_SPECS) {
      await prisma.imagePlaceholderSpec.upsert({
         where: {
            category_variantKey: {
               category: row.category,
               variantKey: row.variantKey,
            },
         },
         update: {
            actualWidth: row.actualWidth,
            actualHeight: row.actualHeight,
            aspectRatioWidth: row.aspectRatioWidth,
            aspectRatioHeight: row.aspectRatioHeight,
            recommendedMaxWidth: row.recommendedMaxWidth,
            recommendedMaxHeight: row.recommendedMaxHeight,
         },
         create: row,
      });
   }
}

export const APP_PRIMARY_VARIANT_KEYS: Record<ImageCategory, string> = {
   audiobook: 'portrait_7_10',
   chapter: 'square_960',
};
