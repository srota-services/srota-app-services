/**
 * Mood DTO (Data Transfer Object) classes
 */
import { Mood as PrismaMood, MoodAttribute as PrismaMoodAttribute } from '@prisma/client';
import type { AudioBookDto } from './AudioBookDto';

export interface MoodAttributeDto {
   id: string;
   moodId: string;
   icon: string;
   description: string;
   createdAt: Date;
   updatedAt: Date;
}

export interface CreateMoodAttributeDto {
   icon: string;
   description: string;
}

export interface MoodDto {
   id: string;
   name: string;
   description: string | null;
   purpose: string;
   descriptionIcon: string;
   hexcode: string;
   icon: string;
   attributes: MoodAttributeDto[];
   createdAt: Date;
   updatedAt: Date;
}

/** Mood payload without attributes or purpose (list/create/update responses) */
export type MoodSummaryDto = Omit<MoodDto, 'attributes' | 'purpose'>;

/** Mood payload with attributes, purpose, and associated audiobooks (GET /moods/:id only) */
export type MoodDetailDto = MoodDto & {
   audiobooks: AudioBookDto[];
};


export interface CreateMoodDto {
   name: string;
   description?: string | null;
   descriptionIcon: string;
   hexcode: string;
   icon: string;
   attributes?: CreateMoodAttributeDto[];
}

export interface UpdateMoodDto {
   name?: string;
   description?: string | null;
   descriptionIcon?: string;
   hexcode?: string;
   icon?: string;
   attributes?: CreateMoodAttributeDto[];
}

export type MoodWithAttributes = PrismaMood & {
   moodAttributes?: PrismaMoodAttribute[];
};

export function toMoodAttributeDto(attribute: PrismaMoodAttribute): MoodAttributeDto {
   return {
      id: attribute.id,
      moodId: attribute.moodId,
      icon: attribute.icon,
      description: attribute.description,
      createdAt: attribute.createdAt,
      updatedAt: attribute.updatedAt
   };
}

export function toMoodSummaryDto(mood: PrismaMood): MoodSummaryDto {
   return {
      id: mood.id,
      name: mood.name,
      description: mood.description,
      descriptionIcon: mood.descriptionIcon,
      hexcode: mood.hexcode,
      icon: mood.icon,
      createdAt: mood.createdAt,
      updatedAt: mood.updatedAt,
   };
}

export function toMoodDto(mood: MoodWithAttributes, includeDetail = false): MoodSummaryDto | MoodDetailDto {
   const base = toMoodSummaryDto(mood);

   if (!includeDetail) {
      return base;
   }

   return {
      ...base,
      purpose: mood.purpose,
      attributes: mood.moodAttributes?.map(toMoodAttributeDto) ?? []
   };
}

/** Validates #RGB or #RRGGBB hex color strings */
export const HEX_COLOR_REGEX = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

export function isValidHexcode(hexcode: string): boolean {
   return HEX_COLOR_REGEX.test(hexcode);
}
