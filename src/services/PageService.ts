/**
 * Page Service — CRUD for authoring-mode chapter pages.
 */
import { PrismaClient } from '@prisma/client';
import { ApiError } from '../types/ApiError';
import { MessageHandler } from '../utils/MessageHandler';
import { rethrowServiceError } from '../utils/serviceError';
import { runWrite } from '../utils/prismaTransaction';
import {
  assertAuthoringAudiobookRequired,
  assertPagesForbiddenForPublication,
  validatePageInput,
} from '../utils/audiobookTypeValidation';
import { CreatePageInput, PageData, UpdatePageRequest, toPageDto } from '../models/PageDto';

export class PageService {
  constructor(private prisma: PrismaClient) {}

  async getPagesByChapterId(chapterId: string): Promise<PageData[]> {
    try {
      await this.loadChapterWithAudiobookType(chapterId);
      const pages = await this.prisma.page.findMany({
        where: { chapterId },
        orderBy: { pageNumber: 'asc' },
      });
      return pages.map(toPageDto);
    } catch (error) {
      rethrowServiceError(error, { operation: 'getPagesByChapterId' }, MessageHandler.getErrorMessage('internal.default'));
    }
  }

  async getPageById(pageId: string): Promise<PageData> {
    try {
      const page = await this.prisma.page.findUnique({ where: { id: pageId } });
      if (!page) {
        throw ApiError.notFound('Page');
      }
      const chapter = await this.loadChapterWithAudiobookType(page.chapterId);
      assertAuthoringAudiobookRequired(chapter.audiobook.type);
      return toPageDto(page);
    } catch (error) {
      rethrowServiceError(error, { operation: 'getPageById' }, MessageHandler.getErrorMessage('internal.default'));
    }
  }

  async createPage(chapterId: string, input: CreatePageInput): Promise<PageData> {
    try {
      const chapter = await this.loadChapterWithAudiobookType(chapterId);
      assertAuthoringAudiobookRequired(chapter.audiobook.type);
      validatePageInput(input);

      const existing = await this.prisma.page.findUnique({
        where: {
          chapterId_pageNumber: {
            chapterId,
            pageNumber: input.pageNumber,
          },
        },
      });
      if (existing) {
        throw ApiError.conflict(MessageHandler.getErrorMessage('conflict.page_number_exists'));
      }

      const page = await runWrite(this.prisma, async (tx) =>
        tx.page.create({
          data: {
            chapterId,
            pageNumber: input.pageNumber,
            plainText: (input.plainText ?? '').trim(),
            richText: input.richText as object,
          },
        }),
      );

      return toPageDto(page);
    } catch (error) {
      rethrowServiceError(error, { operation: 'createPage' }, MessageHandler.getErrorMessage('internal.default'));
    }
  }

  async updatePage(pageId: string, input: UpdatePageRequest): Promise<PageData> {
    try {
      const existing = await this.prisma.page.findUnique({ where: { id: pageId } });
      if (!existing) {
        throw ApiError.notFound('Page');
      }

      const chapter = await this.loadChapterWithAudiobookType(existing.chapterId);
      assertAuthoringAudiobookRequired(chapter.audiobook.type);

      if (input.pageNumber !== undefined && input.pageNumber !== existing.pageNumber) {
        validatePageInput({
          pageNumber: input.pageNumber,
          plainText: input.plainText ?? existing.plainText,
          richText: input.richText ?? (existing.richText as Record<string, unknown>),
        });

        const conflict = await this.prisma.page.findFirst({
          where: {
            chapterId: existing.chapterId,
            pageNumber: input.pageNumber,
            id: { not: pageId },
          },
        });
        if (conflict) {
          throw ApiError.conflict(MessageHandler.getErrorMessage('conflict.page_number_exists'));
        }
      }

      if (input.plainText !== undefined) {
        validatePageInput({
          pageNumber: input.pageNumber ?? existing.pageNumber,
          plainText: input.plainText,
          richText: input.richText ?? (existing.richText as Record<string, unknown>),
        });
      }

      if (input.richText !== undefined) {
        validatePageInput({
          pageNumber: input.pageNumber ?? existing.pageNumber,
          plainText: input.plainText ?? existing.plainText,
          richText: input.richText,
        });
      }

      const page = await runWrite(this.prisma, async (tx) =>
        tx.page.update({
          where: { id: pageId },
          data: {
            ...(input.pageNumber !== undefined && { pageNumber: input.pageNumber }),
            ...(input.plainText !== undefined && { plainText: input.plainText.trim() }),
            ...(input.richText !== undefined && { richText: input.richText as object }),
          },
        }),
      );

      return toPageDto(page);
    } catch (error) {
      rethrowServiceError(error, { operation: 'updatePage' }, MessageHandler.getErrorMessage('internal.default'));
    }
  }

  async deletePage(pageId: string): Promise<void> {
    try {
      const existing = await this.prisma.page.findUnique({ where: { id: pageId } });
      if (!existing) {
        throw ApiError.notFound('Page');
      }

      const chapter = await this.loadChapterWithAudiobookType(existing.chapterId);
      assertAuthoringAudiobookRequired(chapter.audiobook.type);

      const pageCount = await this.prisma.page.count({
        where: { chapterId: existing.chapterId },
      });
      if (pageCount <= 1) {
        throw ApiError.validationError(MessageHandler.getErrorMessage('validation.authoring_last_page_forbidden'));
      }

      await runWrite(this.prisma, async (tx) => tx.page.delete({ where: { id: pageId } }));
    } catch (error) {
      rethrowServiceError(error, { operation: 'deletePage' }, MessageHandler.getErrorMessage('internal.default'));
    }
  }

  async createPagesForChapter(chapterId: string, pages: CreatePageInput[]): Promise<PageData[]> {
    const chapter = await this.loadChapterWithAudiobookType(chapterId);
    assertAuthoringAudiobookRequired(chapter.audiobook.type);

    const created = await runWrite(this.prisma, async (tx) => {
      const results = [];
      for (const pageInput of pages) {
        validatePageInput(pageInput);
        const page = await tx.page.create({
          data: {
            chapterId,
            pageNumber: pageInput.pageNumber,
            plainText: (pageInput.plainText ?? '').trim(),
            richText: pageInput.richText as object,
          },
        });
        results.push(page);
      }
      return results;
    });

    return created.map(toPageDto);
  }

  private async loadChapterWithAudiobookType(chapterId: string) {
    const chapter = await this.prisma.chapter.findUnique({
      where: { id: chapterId },
      include: {
        audiobook: {
          select: { type: true },
        },
      },
    });

    if (!chapter) {
      throw ApiError.notFound('Chapter');
    }

    assertPagesForbiddenForPublication(chapter.audiobook.type);
    return chapter;
  }
}
