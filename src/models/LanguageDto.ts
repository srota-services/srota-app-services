/**
 * Language DTO (Data Transfer Object) classes
 */
import { Language as PrismaLanguage } from '@prisma/client';

export interface LanguageDto {
   id: string;
   name: string;
   code: string;
   createdAt: Date;
   updatedAt: Date;
}

export function toLanguageDto(language: PrismaLanguage): LanguageDto {
   return {
      id: language.id,
      name: language.name,
      code: language.code,
      createdAt: language.createdAt,
      updatedAt: language.updatedAt,
   };
}
