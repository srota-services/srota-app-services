/**
 * Page DTOs for authoring-mode chapter content.
 */
import { Page as PrismaPage } from '@prisma/client';

export interface PageData {
  id: string;
  chapterId: string;
  pageNumber: number;
  plainText: string;
  richText: Record<string, unknown> | unknown[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePageInput {
  pageNumber: number;
  plainText?: string;
  richText: Record<string, unknown> | unknown[];
}

export interface CreatePageRequest extends CreatePageInput {
  chapterId: string;
}

export interface UpdatePageRequest {
  pageNumber?: number;
  plainText?: string;
  richText?: Record<string, unknown> | unknown[];
}

export function toPageDto(page: PrismaPage): PageData {
  return {
    id: page.id,
    chapterId: page.chapterId,
    pageNumber: page.pageNumber,
    plainText: page.plainText,
    richText: page.richText as Record<string, unknown> | unknown[],
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
  };
}
